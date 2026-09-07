const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {DEFAULT_AUDIO_MODEL,modelSettings,words,validateBrief,parseStory,report,escapeHTML,Store,Router,imageExtension,audioExtension} = require('../src/core.cjs');
const brief = {name:'Ela',age:4,language:'Türkçe',theme:'Paylaşma',characters:'Ela ve Pofi',style:'Suluboya',tone:'Sakin',kind:'Uyku',pageCount:24,consent:true};
const paragraph = 'Ela küçük tavşanıyla birlikte güzel bahçeye gitti ve orada yeni arkadaşı için renkli bir çiçek buldu.';
const story = () => ({title:'Ela ve Pofi',characterBible:'Ela sarı paltolu, Pofi beyaz tavşan.',pages:Array.from({length:24},()=>({text:paragraph,imagePrompt:'Ela and a white rabbit in the garden.'}))});
test('Turkish Unicode words and apostrophes',()=>assert.equal(words("Ela'nın dünyası, çiçekler ve ışık!"),5));
test('brief validates ranges, consent, and required fields',()=>{
  assert.equal(validateBrief(brief).age,4);
  for(const patch of [{age:1},{pageCount:31},{pageCount:20.5},{consent:false},{theme:''}])assert.throws(()=>validateBrief({...brief,...patch}));
});
test('story enforces page and total word limits, ignoring model page numbering',()=>{
  const result=parseStory(JSON.stringify(story()),24);assert.equal(result.pages.length,24);assert.equal(result.pages[0].number,1);
  assert.equal(words(result.pages.map(p=>p.text).join(' ')),384);
  assert.throws(()=>parseStory(JSON.stringify(story()),20));
  const short=story();short.pages.forEach(p=>p.text='Merhaba');assert.throws(()=>parseStory(JSON.stringify(short),24),/300–500/);
  assert.throws(()=>parseStory('not json',24),/JSON/);
});
test('markdown JSON fences supported',()=>assert.equal(parseStory('```json\n'+JSON.stringify(story())+'\n```',24).title,'Ela ve Pofi'));
test('reports separate manual verification from objective counts',()=>{
  const b={...story(),brief};b.pages[0].audio='a.mp3';b.pages[0].narratedText='old';b.pages[1].image='img.png';
  const r=report(b);assert.equal(r.wordPass,true);assert.equal(r.images,1);assert.equal(r.audio,0);assert.match(r.note,/otomatik doğrulanmamıştır/);
});
test('export escapes model text to prevent HTML injection',()=>assert.equal(escapeHTML('<script>"&\'</script>'),'&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;'));
test('book store survives reload and denies path traversal',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'noritales-test-'));
  try{const s=new Store(root),b={...story(),brief,id:randomUUID(),created:new Date().toISOString()};await s.save(b);assert.deepEqual(await s.read(b.id),b);assert.equal((await s.list()).length,1);assert.throws(()=>s.dir('../../etc'));await assert.rejects(s.asset(b.id,'../settings.json'));}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('settings default to Voxtral Mini TTS while preserving explicit selections',()=>{
  assert.equal(modelSettings().audioModel,DEFAULT_AUDIO_MODEL);
  assert.equal(modelSettings({audioModel:''}).audioModel,'mistralai/voxtral-mini-tts-2603');
  assert.equal(modelSettings({audioModel:' custom/tts '}).audioModel,'custom/tts');
});
test('model discovery requests all modalities and exposes speech output',async()=>{
  const r=new Router('test',async(url,opts)=>{
    assert.equal(url,'https://openrouter.ai/api/v1/models?output_modalities=all');
    assert.equal(opts.method,'GET');
    return Response.json({data:[
      {id:'test/text',name:'Text',architecture:{input_modalities:['text'],output_modalities:['text']}},
      {id:'mistralai/voxtral-mini-tts-2603',name:'Voxtral Mini TTS',architecture:{input_modalities:['text'],output_modalities:['speech']}}
    ]});
  });
  const models=await r.models();
  assert.equal(models.length,2);
  assert.deepEqual(models.find(model=>model.id===DEFAULT_AUDIO_MODEL).output,['speech']);
});
test('image payload includes reference photos and character guide',async()=>{
  let payload;const png=Buffer.from([137,80,78,71,13,10,26,10]);
  const r=new Router('test-only',async(url,opts)=>{assert.equal(url,'https://openrouter.ai/api/v1/images');payload=JSON.parse(opts.body);return Response.json({data:[{b64_json:png.toString('base64')}],usage:{cost:0.01}});});
  const output=await r.image({...story(),brief},story().pages[0],'test/image',['data:image/png;base64,AAAA']);
  assert.equal(payload.input_references.length,1);assert.match(payload.prompt,/Ela sarı paltolu/);assert.equal(output.ext,'png');
});
test('audio always sends voice reference, exact text, and transcript; no generic voice',async()=>{
  const calls=[];const r=new Router('test-only',async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return new Response(Buffer.from('ID3testaudio'),{headers:{'content-type':'audio/mpeg'}});});
  await r.audio(paragraph,'test/clone','data:audio/wav;base64,AAAA','Merhaba');
  assert.equal(calls[0].body.input,paragraph);assert.equal(calls[0].body.voice,undefined);assert.equal(calls[0].body.input_references[1].text,'Merhaba');assert.equal(calls.length,1);
});
test('API errors do not retry or expose sensitive upstream text',async()=>{
  let calls=0;const r=new Router('secret-key',async()=>{calls++;return new Response('secret-key child name',{status:429});});
  await assert.rejects(r.audio('test','test/model','sample',''),e=>e.message.includes('429')&&!e.message.includes('secret-key'));
  assert.equal(calls,1);
});
test('invalid audio and image output rejected',async()=>{
  const r=new Router('test',async()=>new Response('{"error":"no audio"}'));
  await assert.rejects(r.audio('hello','test/model','sample',''),/MP3/);
  assert.throws(()=>imageExtension(Buffer.from('<svg/>')));
  assert.throws(()=>audioExtension(Buffer.from('not audio')));
});
test('text API produces validated story',async()=>{
  const r=new Router('test',async(_url,opts)=>{const p=JSON.parse(opts.body);assert.equal(p.response_format.type,'json_object');return Response.json({choices:[{message:{content:JSON.stringify(story())}}]});});
  assert.equal((await r.story(brief,'test/text')).pages.length,24);
});
