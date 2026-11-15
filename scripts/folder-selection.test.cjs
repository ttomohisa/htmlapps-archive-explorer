'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../src/index.template.html'),'utf8');
const start=source.indexOf('  function folderSelectableEntries(');
const end=source.indexOf('  function childAggregates(',start);
assert.ok(start>=0&&end>start,'Cannot find production folder-selection helpers');
const code=source.slice(start,end);
function harness(entries){
  const state={entries,selected:new Set(),selectedFolders:new Set()};
  const selectable=e=>!!e&&!e.dir&&!e.unsupported&&typeof e.getData==='function';
  const descendantCount=folder=>{
    const p=folder?folder+'/':'';
    return state.entries.filter(e=>!e.dir&&(folder===''||e.path.startsWith(p))).length;
  };
  const api=new Function('state','canExtractEntry','descendantCount','t','esc','$$','updateSelectionBar','updateSaveLabel',
    code+'\nreturn {folderSelectableEntries,folderSelectionState,folderCheckboxHtml,toggleFolderSelection,pruneFolderSelections};'
  )(state,selectable,descendantCount,(name,...args)=>name+' '+args.join('/'),s=>s,()=>[],()=>{},()=>{});
  return {state,...api};
}
const file=(id,path,unsupported=false)=>({id,path,dir:false,unsupported,getData:async()=>new Uint8Array()});

test('recursive folder checkbox selects eligible descendants only',()=>{
  const h=harness([
    file('a','docs/a.txt'),file('b','docs/sub/b.txt'),file('c','docs/sub/deep/c.txt'),
    file('bad','docs/sub/unsupported.txt',true),file('sibling','docs-extra/sibling.txt'),
    file('root','root.txt'),
  ]);
  assert.equal(h.folderSelectionState('docs').eligible,3);
  assert.equal(h.folderSelectionState('docs').total,4);
  h.toggleFolderSelection('docs',true);
  assert.deepEqual([...h.state.selected].sort(),['a','b','c']);
  assert.deepEqual([...h.state.selectedFolders],['docs']);
  assert.equal(h.folderSelectionState('docs').selected,3);
  assert.equal(h.folderSelectionState('docs-extra').selected,0);
});

test('overlapping parent and child selection deduplicates; deselection remains scoped',()=>{
  const h=harness([file('a','docs/a.txt'),file('b','docs/sub/b.txt'),file('c','else/c.txt')]);
  h.toggleFolderSelection('docs/sub',true);
  h.toggleFolderSelection('docs',true);
  h.toggleFolderSelection('docs',true);
  assert.equal(h.state.selected.size,2);
  h.toggleFolderSelection('docs/sub',false);
  assert.deepEqual([...h.state.selected],['a']);
  assert.equal(h.folderSelectionState('docs').selected,1);
  assert.equal(h.state.selectedFolders.has('docs/sub'),false);
  h.toggleFolderSelection('docs',false);
  assert.equal(h.state.selected.size,0);
  assert.equal(h.state.selectedFolders.size,0);
});

test('individually unchecked entry produces mixed folder state, even for duplicated names',()=>{
  const h=harness([file('one','folder/a.txt'),file('two','folder/a.txt'),file('three','folder/b.txt')]);
  h.toggleFolderSelection('folder',true);
  assert.equal(h.state.selected.size,3);
  h.state.selected.delete('two');
  h.pruneFolderSelections();
  assert.equal(h.folderSelectionState('folder').selected,2);
  assert.match(h.folderCheckboxHtml('folder','folder'),/aria-checked="mixed"/);
  h.toggleFolderSelection('folder',true);
  assert.equal(h.state.selected.size,3);
});

test('root folder covers entire archive; prefix cannot select similarly named sibling',()=>{
  const h=harness([file('a','docs/a.txt'),file('b','docs-plus/b.txt'),file('c','root.txt')]);
  h.toggleFolderSelection('docs',true);
  assert.deepEqual([...h.state.selected],['a']);
  h.toggleFolderSelection('',true);
  assert.equal(h.state.selected.size,3);
  h.toggleFolderSelection('docs',false);
  assert.deepEqual([...h.state.selected].sort(),['b','c']);
});

test('no extractable files disables folder checkbox',()=>{
  const h=harness([file('bad','folder/unsupported.bin',true)]);
  const html=h.folderCheckboxHtml('folder','folder');
  assert.match(html,/ disabled/);
  h.toggleFolderSelection('folder',true);
  assert.equal(h.state.selected.size,0);
});

test('one-file folder selection exports ZIP, unlike one individually selected file',()=>{
  assert.match(source,/if\(es\.length===1&&!state\.selectedFolders\.size\)/);
  assert.match(source,/selectedFolders:new Set\(state\.selectedFolders\)/);
  assert.match(source,/state\.selectedFolders\.clear\(\)/);
});
