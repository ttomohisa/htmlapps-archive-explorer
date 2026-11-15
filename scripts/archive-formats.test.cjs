'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../src/index.template.html'),'utf8');
const segment=(from,to)=>{
  const start=source.indexOf('  '+from),end=source.indexOf('  '+to,start);
  assert.ok(start>=0&&end>start,'Missing source section: '+from+' to '+to);
  return source.slice(start,end);
};
const state={generation:1};
const impl=[
  `const UTF8=new TextDecoder('utf-8');const UTF8_FATAL=new TextDecoder('utf-8',{fatal:true});const ANSI=new TextDecoder('windows-1252');`,
  segment('function cleanPath','function classify'),
  segment('function dosDate','const CRC32_TABLE'),
  segment('const CRC32_TABLE','async function parseTarBytes'),
  segment('async function parseTarBytes','function isTar'),
  segment('function decodeBytes','function readVint'),
  segment('function staleArchiveError','async function entryData'),
  segment('function u16','async function saveSelected'),
].join('\n');
const api=new Function('state','setPhase','showToast','t','entryData',
  impl+'\nreturn {crc32,parseZip,parseTarBytes,findEOCD,safeZipEntryPath,buildStoredZip};'
)(state,()=>{},()=>{},()=>'',e=>e.getData());
const u16=n=>[n&255,(n>>>8)&255];
const u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
const enc=new TextEncoder();
const fileFrom=bytes=>({arrayBuffer:async()=>Uint8Array.from(bytes).buffer});

function storedZip(records,comment=new Uint8Array()){
  const locals=[],centrals=[];
  for(const record of records){
    const name=[...enc.encode(record.name)],data=[...enc.encode(record.data)],crc=api.crc32(Uint8Array.from(data));
    const offset=locals.length;
    locals.push(...[80,75,3,4,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0,...name,...data]);
    centrals.push(...[80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(offset),...name]);
  }
  return Uint8Array.from([...locals,...centrals,80,75,5,6,0,0,0,0,...u16(records.length),...u16(records.length),...u32(centrals.length),...u32(locals.length),...u16(comment.length),...comment]);
}
function tarEntry(name,flag,data){
  const bytes=new Uint8Array(512),body=Buffer.from(data);
  const put=(str,at)=>bytes.set(enc.encode(str),at);
  const oct=(n,w)=>n.toString(8).padStart(w-1,'0')+'\0';
  put(name,0);put(oct(body.length,12),124);put(oct(0,12),136);
  bytes.fill(32,148,156);bytes[156]=flag.charCodeAt(0);put('ustar\0',257);put('00',263);
  const sum=bytes.reduce((total,b)=>total+b,0);
  put(sum.toString(8).padStart(6,'0')+'\0 ',148);
  const padded=Buffer.alloc(Math.ceil(body.length/512)*512);
  body.copy(padded);
  return Buffer.concat([bytes,padded]);
}
function paxRecord(key,value){
  const body=enc.encode(key+'='+value+'\n');
  let count=body.length+3;
  while(String(count).length+1+body.length!==count)count=String(count).length+1+body.length;
  return Buffer.concat([Buffer.from(count+' '),Buffer.from(body)]);
}

test('ZIP extracts intact stored data but rejects wrong CRC32',async()=>{
  const file=storedZip([{name:'sample.txt',data:'HELLO'}]);
  const good=(await api.parseZip(fileFrom(file),1))[0];
  assert.equal(new TextDecoder().decode(await good.getData()),'HELLO');
  const damaged=file.slice();damaged[30+enc.encode('sample.txt').length]^=1;
  const bad=(await api.parseZip(fileFrom(damaged),1))[0];
  await assert.rejects(()=>bad.getData(),/CRC32/);
});
test('ZIP comment with a fake EOCD signature does not mask the real EOCD',async()=>{
  const comment=Uint8Array.from([...enc.encode('note'),80,75,5,6,...new Uint8Array(18)]);
  const bytes=storedZip([{name:'a.txt',data:'safe'}],comment);
  const entries=await api.parseZip(fileFrom(bytes),1);
  assert.equal(entries.length,1);
  assert.equal(entries[0].path,'a.txt');
});
test('duplicate ZIP paths remain separate entries',async()=>{
  const entries=await api.parseZip(fileFrom(storedZip([{name:'same.txt',data:'first'},{name:'same.txt',data:'second'}])),1);
  assert.equal(entries.length,2);
  assert.deepEqual(await Promise.all(entries.map(async e=>new TextDecoder().decode(await e.getData()))),['first','second']);
  assert.match(source,/state\.entries=entries\.filter\(e=>e\.path\)\.map\(\(e,i\)=>\(\{\.\.\.e,id:/);
  assert.match(source,/state\.selected\.has\(e\.id\)/);
});
test('PAX path is applied to the next TAR entry and metadata is hidden',async()=>{
  const pax=paxRecord('path','deep/日本語のファイル名.txt');
  const bytes=Buffer.concat([tarEntry('PaxHeaders/metadata','x',pax),tarEntry('short.txt','0',Buffer.from('TEXT')),Buffer.alloc(1024)]);
  const entries=await api.parseTarBytes(bytes,1);
  assert.deepEqual(entries.map(x=>x.path),['deep/日本語のファイル名.txt']);
  assert.equal(new TextDecoder().decode(await entries[0].getData()),'TEXT');
});
test('GNU long-name TAR extension is applied to the next file',async()=>{
  const bytes=Buffer.concat([tarEntry('././@LongLink','L',Buffer.from('nested/very-long-file-name.txt\0')),tarEntry('short.txt','0',Buffer.from('data')),Buffer.alloc(1024)]);
  const entries=await api.parseTarBytes(bytes,1);
  assert.deepEqual(entries.map(e=>e.path),['nested/very-long-file-name.txt']);
});
test('TAR symlinks cannot be extracted as empty regular files',async()=>{
  const bytes=Buffer.concat([tarEntry('symlink','2',Buffer.alloc(0)),Buffer.alloc(1024)]);
  const entries=await api.parseTarBytes(bytes,1);
  assert.equal(entries[0].unsupported,true);
  await assert.rejects(()=>entries[0].getData(),/links are not extractable/);
});
test('ZIP re-export removes traversal and absolute paths and deduplicates names',async()=>{
  assert.equal(api.safeZipEntryPath('../../outside.txt'),'outside.txt');
  assert.equal(api.safeZipEntryPath('C:\\temp\\one.txt'),'temp/one.txt');
  const files=['../same.txt','same.txt','/same.txt'].map(path=>({path,modified:new Date('2026-01-01'),getData:async()=>enc.encode('ok')}));
  const result=await api.buildStoredZip(files);
  const contents=await result.arrayBuffer();
  const entries=await api.parseZip(fileFrom(new Uint8Array(contents)),1);
  assert.deepEqual(entries.map(e=>e.path),['same.txt','same-2.txt','same-3.txt']);
  for(const e of entries)assert.equal(new TextDecoder().decode(await e.getData()),'ok');
});

test('ZIP export disambiguates both file/directory prefix collisions and case collisions',async()=>{
  const paths=[
    'notes', 'notes/a.txt', 'docs/file.txt', 'DOCS',
    'docs/FILE.txt', 'notes/b.txt'
  ];
  const files=paths.map((name,i)=>({
    path:name,
    modified:new Date('2026-01-01'),
    getData:async()=>enc.encode('record-'+i)
  }));
  const blob=await api.buildStoredZip(files);
  const entries=await api.parseZip(fileFrom(new Uint8Array(await blob.arrayBuffer())),1);
  assert.deepEqual(entries.map(e=>e.path),[
    'notes', 'notes-2/a.txt', 'docs/file.txt', 'DOCS-2',
    'docs/FILE-2.txt', 'notes-2/b.txt'
  ]);
  assert.deepEqual(await Promise.all(entries.map(async e=>new TextDecoder().decode(await e.getData()))),
    files.map((_,i)=>'record-'+i));
});

test('TAR.GZ per-entry compression is marked unavailable, not zero savings',()=>{
  assert.match(source,/for\(const entry of entries\)if\(!entry\.dir\)entry\.compressedSize=null/);
});

test('ZIP export cancels before download when a newer archive replaces its source',async()=>{
  let resolveData;
  const e={path:'old/file.txt',getData:()=>new Promise(resolve=>{resolveData=resolve}),modified:new Date('2026-01-01')};
  const promise=api.buildStoredZip([e]);
  state.generation++;
  resolveData(enc.encode('OLD ARCHIVE'));
  await assert.rejects(promise,{code:'STALE_ARCHIVE'});
  state.generation--;
});
