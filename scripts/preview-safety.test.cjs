'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');

const source=fs.readFileSync(path.join(__dirname,'../src/index.template.html'),'utf8');
const start=source.indexOf('  function shouldSkipHexPreview(');
const end=source.indexOf('  async function renderInspector(',start);
assert.ok(start>=0&&end>start,'Missing Hex preview safety predicate');
const shouldSkipHexPreview=new Function(source.slice(start,end)+';return shouldSkipHexPreview')();

test('huge Deflate ZIPs and encrypted ZIPs skip eager Hex decompression',()=>{
  const e={source:'zip',method:8,encrypted:false,size:80*1024*1024,getDataRange:async()=>new Uint8Array()};
  assert.equal(shouldSkipHexPreview(e),true);
  assert.equal(shouldSkipHexPreview({...e,method:0}),false,'Stored ZIP can read a prefix without inflating');
  assert.equal(shouldSkipHexPreview({...e,method:0,encrypted:true}),true);
});

test('tiny file inside a huge solid 7z skips whole-folder inflation',()=>{
  const e={source:'7z',size:100,getDataRange:async()=>new Uint8Array(),wholeDataSize:200*1024*1024};
  assert.equal(shouldSkipHexPreview(e),true);
  assert.equal(shouldSkipHexPreview({...e,wholeDataSize:20*1024*1024}),false);
});

test('TAR supports streaming prefixes and unknown full-read source is guarded',()=>{
  const e={source:'tar',size:100*1024*1024,getDataRange:async()=>new Uint8Array()};
  assert.equal(shouldSkipHexPreview(e),false);
  assert.equal(shouldSkipHexPreview({...e,getDataRange:null}),true);
});
