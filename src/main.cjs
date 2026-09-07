const {app, BrowserWindow, ipcMain, dialog, safeStorage, shell, session} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {randomUUID} = require('node:crypto');
const {Store, Router, required, validateBrief, report, escapeHTML, imageExtension, audioExtension} = require('./core.cjs');
let win, store, key = '', busy = false;
let selections = {photos: [], voice: null};
const uiURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
let settings = {textModel:'',imageModel:'',audioModel:''};
function router() { return new Router(key); }
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== uiURL) throw Error('Yetkisiz çağrı.');
    try { return {ok:true, data:await fn(...args)}; }
    catch (e) { return {ok:false, error:e.message}; }
  });
}
async function exclusive(fn) {
  if (busy) throw Error('Devam eden işlem bitene kadar bekleyin.');
  busy = true;
  try { return await fn(); } finally { busy = false; }
}
async function hydrated(book) {
  const pages = [];
  for (const p of book.pages) pages.push({...p, imageURL:p.image ? await store.dataURL(book.id,p.image) : null, audioURL:p.audio ? await store.dataURL(book.id,p.audio) : null});
  return {...book,pages,report:report(book)};
}
function register() {
  handle('settings', () => ({...settings,hasKey:!!key,storage:path.join(app.getPath('userData'),'books')}));
  handle('save-settings', input => exclusive(async () => {
    settings = Object.fromEntries(['textModel','imageModel','audioModel'].map(k => [k, String(input[k] || '').trim().slice(0,200)]));
    if (input.key) key = required(input.key, 'API anahtarı', 1000);
    const persisted = {...settings};
    if (input.remember && key) {
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw Error('İşletim sistemi şifrelemesi yok. Anahtar yalnızca bu oturumda kullanılabilir.');
      persisted.encryptedKey = safeStorage.encryptString(key).toString('base64');
    }
    await fs.writeFile(path.join(app.getPath('userData'),'settings.json'),JSON.stringify(persisted),{mode:0o600});
    return {hasKey:!!key};
  }));
  handle('models', async () => {
    const r = await router().request('/models'); const data = await r.json();
    return (data.data || []).map(m => ({id:m.id, name:m.name, input:m.architecture?.input_modalities || [], output:m.architecture?.output_modalities || [], pricing:m.pricing || {}}));
  });
  handle('pick', kind => exclusive(async () => {
    if (!['photos','voice'].includes(kind)) throw Error('Geçersiz seçim.');
    const photos = kind === 'photos';
    const result = await dialog.showOpenDialog(win,{properties:photos ? ['openFile','multiSelections'] : ['openFile'], filters:[{name:photos ? 'Fotoğraflar' : 'Ebeveyn sesi', extensions:photos ? ['jpg','jpeg','png','webp'] : ['mp3','wav','webm']}]});
    if (result.canceled) return null;
    if (result.filePaths.length > 3) throw Error('En fazla 3 fotoğraf seçin. Modeliniz daha az destekleyebilir.');
    const files = [];
    for (const file of result.filePaths) {
      if ((await fs.stat(file)).size > (photos ? 8 : 14) * 1024 * 1024) throw Error(photos ? 'Fotoğraf en fazla 8 MB olmalı.' : 'Ses en fazla 14 MB olmalı.');
      const bytes = await fs.readFile(file); const ext = photos ? imageExtension(bytes) : audioExtension(bytes);
      files.push({bytes,ext,name:path.basename(file)});
    }
    selections[kind] = photos ? files : files[0];
    return files.map(f => f.name);
  }));
  handle('create', input => exclusive(async () => {
    const brief = validateBrief(input);
    const model = required(settings.textModel,'Metin modeli',200);
    // Only text is transmitted in this step. Photos and voice are copied locally.
    const story = await router().story(brief, model);
    const id = randomUUID();
    const book = {...story,id,brief,created:new Date().toISOString(),references:[],voice:null,transcript:String(input.transcript || '').slice(0,6000),models:{...settings},events:[{type:'story',at:new Date().toISOString(),model,usage:story.usage}]};
    await store.save(book);
    for (const [i,f] of selections.photos.entries()) {
      const filename = `ref-${i+1}.${f.ext}`; await fs.writeFile(path.join(store.dir(id),filename), f.bytes,{mode:0o600});
      book.references.push(filename);
    }
    if (selections.voice) {
      book.voice = `voice.${selections.voice.ext}`;
      await fs.writeFile(path.join(store.dir(id),book.voice),selections.voice.bytes,{mode:0o600});
    }
    await store.save(book); return hydrated(book);
  }));
  handle('list', () => store.list());
  handle('load', id => exclusive(async () => hydrated(await store.read(id))));
  handle('edit', input => exclusive(async () => {
    const book = await store.read(input.id); const page = book.pages[input.index];
    if (!page) throw Error('Sayfa bulunamadı.');
    const text = required(input.text,'Metin',1500), imagePrompt = required(input.imagePrompt,'Resim açıklaması',4000);
    if (page.text !== text) { delete page.audio; delete page.narratedText; delete page.image; }
    if (page.imagePrompt !== imagePrompt) delete page.image;
    page.text = text; page.imagePrompt = imagePrompt;
    book.review = {}; await store.save(book); return hydrated(book);
  }));
  handle('generate', input => exclusive(async () => {
    const book = await store.read(input.id);
    if (!book.brief.consent) throw Error('İzin eksik.');
    if (!['image','audio'].includes(input.kind)) throw Error('İşlem türü yanlış.');
    const indexes = input.all ? book.pages.map((_,i)=>i) : [input.index];
    const model = required(settings[input.kind === 'image' ? 'imageModel' : 'audioModel'],'Model',200);
    if (input.kind === 'image' && !book.references.length) throw Error('Fotoğraf yüklenmemiş. Yeni kitap formunda referans fotoğraf seçin.');
    if (input.kind === 'audio' && !book.voice) throw Error('Ebeveyn sesi yüklenmemiş. Yeni kitap formunda ses seçin.');
    const refs = input.kind === 'image' ? await Promise.all(book.references.map(f=>store.dataURL(book.id,f))) : [];
    const sample = input.kind === 'audio' ? await store.dataURL(book.id,book.voice) : null;
    for (const index of indexes) {
      const page = book.pages[index]; if (!page) throw Error('Sayfa bulunamadı.');
      if (input.all && page[input.kind]) continue; // Resume only missing pages; no implicit reruns.
      win.webContents.send('progress',`${input.kind === 'image' ? 'Resim' : 'Ses'}: ${index+1}/${book.pages.length}`);
      if (input.kind === 'image') {
        const result = await router().image(book,page,model,refs);
        const filename = `page-${index+1}-${randomUUID()}.${result.ext}`;
        await fs.writeFile(path.join(store.dir(book.id),filename),result.bytes,{mode:0o600}); page.image = filename;
        book.events.push({type:'image',page:index+1,model,usage:result.usage,at:new Date().toISOString()});
      } else {
        const bytes = await router().audio(page.text,model,sample,book.transcript);
        const filename = `page-${index+1}-${randomUUID()}.mp3`;
        await fs.writeFile(path.join(store.dir(book.id),filename),bytes,{mode:0o600}); page.audio = filename; page.narratedText = page.text;
        book.events.push({type:'audio',page:index+1,model,at:new Date().toISOString()});
      }
      book.review = {}; await store.save(book);
    }
    return hydrated(book);
  }));
  handle('review', input => exclusive(async () => {
    const book = await store.read(input.id);
    book.review = Object.fromEntries(['theme','age','likeness','voice','complete'].map(k=>[k,input[k] === true]));
    book.review.notes = String(input.notes || '').slice(0,6000);
    book.review.at = new Date().toISOString(); await store.save(book); return report(book);
  }));
  handle('folder', async id => { const dir = id ? store.dir(id) : store.root; await fs.mkdir(dir,{recursive:true}); return shell.openPath(dir); });
  handle('export', id => exclusive(async () => {
    const book = await hydrated(await store.read(id));
    const target = await dialog.showSaveDialog(win,{defaultPath:'NoriTales-kitap.html',filters:[{name:'Çevrimdışı kitap',extensions:['html']}]});
    if (target.canceled) return null;
    const pages = book.pages.map(p=>`<section>${p.imageURL ? `<img src="${p.imageURL}" alt="Sayfa ${p.number}">` : '<div class="missing">Resim henüz üretilmedi</div>'}<p>${escapeHTML(p.text)}</p>${p.audioURL ? `<audio controls src="${p.audioURL}"></audio>` : ''}<small>${p.number} / ${book.pages.length}</small></section>`).join('');
    const html = `<!doctype html><html lang="${book.brief.language === 'Türkçe' ? 'tr':'en'}"><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'"><title>${escapeHTML(book.title)}</title><style>body{font:20px Georgia;background:#fbf9f6;color:#1e1b4b;margin:0}header{text-align:center;padding:24px}section{box-sizing:border-box;max-width:760px;margin:24px auto;padding:32px;background:white;break-after:page}img{width:100%;max-height:65vh;object-fit:contain}p{line-height:1.8;white-space:pre-wrap}small{display:block;text-align:center}audio{width:100%}.missing{padding:100px;text-align:center;background:#eee}@media print{header,audio{display:none}section{height:260mm;margin:0;max-width:none;padding:10mm}section:last-child{break-after:auto}img{height:175mm;max-height:none}p{font-size:18pt}body{background:white}@page{size:A4;margin:10mm}}</style><header><h1>${escapeHTML(book.title)}</h1><p>NoriTales · Their story. Your voice.</p><p>PDF için tarayıcıda Yazdır → PDF olarak kaydet. AI üretimi; ebeveyn incelemesi gerekir.</p></header>${pages}</html>`;
    await fs.writeFile(target.filePath,html,{mode:0o600}); return target.filePath;
  }));
}
app.whenReady().then(async () => {
  store = new Store(path.join(app.getPath('userData'),'books'));
  try {
    const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'settings.json'),'utf8'));
    for (const k of Object.keys(settings)) settings[k] = String(saved[k] || '');
    if (saved.encryptedKey && safeStorage.isEncryptionAvailable()) key = safeStorage.decryptString(Buffer.from(saved.encryptedKey,'base64'));
  } catch { /* First run or OS key unavailable: ask for key again. */ }
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win = new BrowserWindow({width:1440,height:950,minWidth:1000,minHeight:700,backgroundColor:'#fbf9f6',title:'NoriTales · Local Studio',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate', e=>e.preventDefault());
  win.on('close', e=>{if(busy){e.preventDefault();dialog.showMessageBox(win,{message:'Üretim sürüyor. Tamamlanmasını bekleyin; mevcut sayfalar diske kaydediliyor.'});}});
  register(); await win.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed',()=>app.quit());
