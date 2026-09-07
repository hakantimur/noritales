// Optional UI smoke test: npm install --no-save playwright, then npx playwright install chromium.
// No API requests. Electron bridge is mocked; this is not a Windows desktop integration test.
const {chromium} = require(require.resolve('playwright',{paths:[process.cwd(),process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()]}));
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const text='Ela küçük tavşanıyla birlikte güzel bahçeye gitti ve orada yeni arkadaşı için renkli bir çiçek buldu.';
      let b=null;
      window.nori={progress:()=>{},call:async(method,data)=>{
        let result;
        if(method==='settings')result={textModel:'test/text',imageModel:'test/image',audioModel:'test/audio',hasKey:true,storage:'test-data'};
        if(method==='list')result=b?[b]:[];
        if(method==='pick')result=['test-reference'];
        if(method==='create'){
          b={id:'test',title:'Ela ve Pofi',brief:data,pages:Array.from({length:24},(_,i)=>({number:i+1,text,imagePrompt:'A gentle garden'})),report:{pages:24,words:384,pagePass:true,wordPass:true,images:0,audio:0},created:new Date().toISOString()};result=b;
        }
        if(method==='load')result=b;
        if(method==='edit'){b.pages[data.index].text=data.text;b.pages[data.index].imagePrompt=data.imagePrompt;result=b;}
        if(method==='review'){b.review=data;result=b.report;}
        return {ok:true,data:result};
      }};
    });
    await page.goto(pathToFileURL(path.join(__dirname,'../src/index.html')).href);
    await page.getByRole('textbox',{name:'Çocuğun adı',exact:true}).fill('Ela');
    await page.locator('[name=characters]').fill('Ela ve Pofi');
    await page.locator('[name=theme]').fill('Paylaşmak');
    await page.locator('[name=consent]').check();
    await page.screenshot({path:process.env.NORI_SCREENSHOT || '/tmp/noritales-form.png',fullPage:true});
    await page.locator('#create-story').click();
    await page.locator('#book-title').waitFor({state:'visible'});
    assert.equal(await page.locator('#book-title').textContent(),'Ela ve Pofi');
    await page.locator('#next').click();assert.equal(await page.locator('#page-number').textContent(),'2 / 24');
    await page.locator('#edit-text').fill((await page.locator('#edit-text').inputValue())+' Sonra gülümsedi.');
    await page.locator('#save-page').click();
    await page.waitForFunction(()=>document.getElementById('page-text').textContent.endsWith('Sonra gülümsedi.'));
    await page.locator('#review [name=theme]').check();
    await page.locator('#review button').click();
    await page.locator('[data-tab=library]').click();
    await page.getByRole('button',{name:'Kitabı aç',exact:true}).click();
    await page.locator('#book-title').waitFor({state:'visible'});
    await page.screenshot({path:'/tmp/noritales-reader.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    console.log('UI smoke passed: create, navigate, edit, review, library reload; no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
