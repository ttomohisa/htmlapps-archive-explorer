'use strict';
// Native Chromium checks run only in the existing unprivileged PR build job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const PHONE_WIDTH = 720;
const HELP = "#helpBtn", LANGUAGE = "#langBtn", CLOSE = "[data-dialog-close]";
const artifacts = path.resolve('test-results/mobile-layout');

async function exerciseActions(page, width, label) {
  await page.locator('#fileInput').setInputFiles({name:'mobile-layout.zip', mimeType:'application/zip', buffer:Buffer.from('UEsDBBQAAAAAAMyOV123NFxhJwAAACcAAAAKAAAAc2FtcGxlLnR4dFN5bnRoZXRpYyBsb2NhbCBtb2JpbGUtbGF5b3V0IGZpeHR1cmUuClBLAQIUAxQAAAAAAMyOV123NFxhJwAAACcAAAAKAAAAAAAAAAAAAACAAQAAAABzYW1wbGUudHh0UEsFBgAAAAABAAEAOAAAAE8AAAAAAA==', 'base64')});
  await page.locator('#appView').waitFor();
  if (width <= PHONE_WIDTH) {
    assert.equal(await page.locator('#mobileBar').isVisible(), true, label + ': mobile navigation');
    for (const control of ['[data-mobile-view="explorerView"]','[data-mobile-view="analysisView"]','[data-mobile-view="safetyView"]','#mobileSave']) assert.equal(await page.locator(control).isVisible(), true, label + ': navigation action ' + control);
  }
}


function testZip(records) {
  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) crcTable = Array.from({length:256},(_,i)=>{
      let c=i; for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0;
    });
    let crc=0xffffffff;
    for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];
    return (crc^0xffffffff)>>>0;
  }
  const local=[],central=[];let offset=0;
  for(const record of records){
    const name=Buffer.from(record.name,'utf8'),data=Buffer.from(record.data,'utf8'),crc=crc32(data);
    const lh=Buffer.alloc(30),ch=Buffer.alloc(46);
    lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x0800,6);
    lh.writeUInt32LE(crc,14);lh.writeUInt32LE(data.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(name.length,26);
    ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x0800,8);
    ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(offset,42);
    local.push(lh,name,data);central.push(ch,name);offset+=lh.length+name.length+data.length;
  }
  const centralSize=central.reduce((n,part)=>n+part.length,0),eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(records.length,8);eocd.writeUInt16LE(records.length,10);
  eocd.writeUInt32LE(centralSize,12);eocd.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...central,eocd]);
}

async function exerciseFolderSelection(page,width,lang,label){
  const fixture=testZip([
    {name:'docs/a.txt',data:'A'},
    {name:'docs/sub/b.txt',data:'B'},
    {name:'docs/sub/c.txt',data:'C'},
    {name:'docs-more/outside.txt',data:'OUTSIDE'},
  ]);
  await page.locator('#fileInput').setInputFiles({name:'folders.zip',mimeType:'application/zip',buffer:fixture});
  const folder=page.locator('#fileList [data-select-folder="docs"]');
  await folder.waitFor();
  await folder.check();
  assert.equal(await page.locator('#selectionText').textContent(),lang==='ja'?'3件選択':'3 selected',label+': folder selection count');
  await page.locator('#fileList [data-open="docs"]').click();
  const a=page.locator('#fileList [data-select]').first();
  await a.uncheck();
  await page.locator('#breadcrumb [data-crumb=""]').click();
  assert.equal(await folder.evaluate(el=>el.indeterminate),true,label+': partial folder selection');
  await folder.check();
  assert.equal(await page.locator('#selectionText').textContent(),lang==='ja'?'3件選択':'3 selected',label+': no duplicates from reselection');
  await folder.uncheck();
  assert.equal(await page.locator('#selectionBar').isVisible(),false,label+': clear folder selection');
  await page.locator('#fileList [data-open="docs"]').click();
  await page.locator('#fileList [data-select-folder="docs/sub"]').check();
  assert.equal(await page.locator('#selectionText').textContent(),lang==='ja'?'2件選択':'2 selected',label+': nested folder selection');
  const pending=page.waitForEvent('download');
  await page.locator(width<=PHONE_WIDTH?'#mobileSave':'#extractSelected').click();
  const download=await pending;
  assert.match(download.suggestedFilename(),/-selected\.zip$/,label+': folder exports as ZIP');
  const bytes=await fs.promises.readFile(await download.path());
  assert.equal(bytes.readUInt32LE(0),0x04034b50,label+': valid ZIP header');
  const filename=bytes.subarray(30,30+bytes.readUInt16LE(26)).toString('utf8');
  assert.equal(filename,'docs/sub/b.txt',label+': folder path preserved');
  assert.equal(bytes.includes(Buffer.from('docs-more/outside.txt')),false,label+': sibling excluded');
}

async function main() {
  fs.mkdirSync(artifacts, {recursive:true});
  const browser = await chromium.launch();
  try {
    const cases = [];
    for (const language of ['ja', 'en']) {
      for (const [width, height] of [[1360,900], [PHONE_WIDTH + 1,568], [PHONE_WIDTH,568], [320,568], [393,252]]) cases.push({file:'dist/index.html', language, width, height});
    }
    // Also load the compressed and root download variants, without duplicating the full matrix.
    cases.push({file:'dist/index.self-extract.html', language:'en', width:360, height:640});
    cases.push({file:'archive-explorer.html', language:'ja', width:1360, height:900});
    for (const {file, language, width, height} of cases) {
      const context = await browser.newContext({viewport:{width,height}, locale:language, reducedMotion:'reduce'});
      const page = await context.newPage();
      const errors = [], requests = [];
      const label = `${file} ${language} ${width}x${height}`;
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
      try {
        await page.goto(pathToFileURL(path.resolve(file)).href);
        await page.locator(HELP).waitFor();
        if (await page.locator('html').getAttribute('lang') !== language) await page.locator(LANGUAGE).click();
        assert.equal((await page.locator('[data-i18n="localOnly"]').textContent()).trim(), language === 'en' ? 'Fully local processing' : '完全ローカル処理', label + ': privacy wording');
        assert.equal(await page.locator('.local-badge').isVisible(), width > PHONE_WIDTH, label + ': local badge is desktop-only');
        const brandStyle = await page.locator('.brand-name').evaluate(el => {
          const style = getComputedStyle(el);
          return { font:style.fontFamily, size:style.fontSize, weight:style.fontWeight, width:el.getBoundingClientRect().width };
        });
        await page.locator(LANGUAGE).click();
        const switchedBrandStyle = await page.locator('.brand-name').evaluate(el => {
          const style = getComputedStyle(el);
          return { font:style.fontFamily, size:style.fontSize, weight:style.fontWeight, width:el.getBoundingClientRect().width };
        });
        assert.deepEqual(switchedBrandStyle, brandStyle, label + ': stable title sizing when language changes');
        await page.locator(LANGUAGE).click();
        assert.equal(await page.locator('body > footer').isVisible(), width > PHONE_WIDTH, label + ': informational footer breakpoint');
        await exerciseActions(page, width, label);
        if (file === 'dist/index.html' && ((language === 'ja' && width === 1360) || (language === 'en' && width === 393))) {
          await exerciseFolderSelection(page,width,language,label);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + ': page width');
        // Responsive changes must not leave the informational footer in a stale state.
        await page.setViewportSize({width:PHONE_WIDTH + 1, height});
        assert.equal(await page.locator('body > footer').isVisible(), true, label + ': wider resize');
        await page.setViewportSize({width:PHONE_WIDTH, height});
        assert.equal(await page.locator('body > footer').isVisible(), false, label + ': phone resize');
        await page.setViewportSize({width,height});
        if (file === 'dist/index.html' && [1360,320].includes(width)) await page.screenshot({path:path.join(artifacts, `${language}-${width}.png`), fullPage:true});

        await page.locator(HELP).click();
        const body = page.locator('#helpDialog .dialog-body');
        assert.equal(await page.locator('#helpDialog .dialog-body > h3:first-child').evaluate(el => getComputedStyle(el).marginTop), '0px', label + ': no gap before first help heading');
        await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
        const finalItem = page.locator('#helpDialog .dialog-body p:visible, #helpDialog .dialog-body li:visible').last();
        const finalBox = await finalItem.boundingBox(), bodyBox = await body.boundingBox();
        assert.ok(finalBox && bodyBox && finalBox.y >= bodyBox.y - 1 && finalBox.y + finalBox.height <= bodyBox.y + bodyBox.height + 1, label + ': final Help guidance reachable');
        assert.ok(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1), label + ': Help width');
        const header = await page.locator('#helpDialog .dialog-head, #helpDialog .dialog-header').boundingBox();
        assert.ok(header && header.y >= 0 && header.y + header.height <= height, label + ': Help header visible');
        const beforeScroll = await page.evaluate(() => scrollY);
        await page.mouse.move(2, Math.floor(height / 2));
        await page.mouse.wheel(0,400);
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => scrollY), beforeScroll, label + ': modal background locked');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': Escape closes Help');
        await page.locator(HELP).click();
        await page.locator('#helpDialog').locator(CLOSE).first().click();
        assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': Help reopens and closes');
        assert.deepEqual(errors, [], label + ': console errors');
        assert.deepEqual(requests, [], label + ': no external runtime requests');
        console.log('PASS ' + label);
      } catch (error) {
        await page.screenshot({path:path.join(artifacts,'failure.png'), fullPage:true}).catch(() => {});
        throw new Error(label + ': ' + error.message, {cause:error});
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
