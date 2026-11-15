'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('tag and release occur only for main pushes after valid build checks',()=>{
  const yaml=fs.readFileSync(path.join(root,'.github/workflows/release.yml'),'utf8');
  assert.match(yaml,/push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(yaml,/if: github\.ref == 'refs\/heads\/main'/);
  assert.match(yaml,/contents: write/);
  assert.match(yaml,/\.\/scripts\/check-repository\.ps1/);
  assert.match(yaml,/\$version = \(Get-Content -LiteralPath app\.config\.json/);
  assert.match(yaml,/gh release view \$tag/);
  assert.match(yaml,/gh release create \$tag/);
  assert.match(yaml,/dist\/index\.html#archive-explorer\.html/);
  assert.match(yaml,/dist\/index\.self-extract\.html#archive-explorer-self-extract\.html/);
});
test('header hero and responsive affordances use the expected visible copy and styling',()=>{
  const html=fs.readFileSync(path.join(root,'src/index.template.html'),'utf8');
  assert.match(html,/<h2 data-i18n="heroTitle">圧縮ファイルの中身を確認<\/h2>/);
  assert.match(html,/<h2 data-i18n="heroTitle">圧縮ファイルの中身を確認<\/h2>/);
  assert.match(html,/heroTitle:"See what's inside an archive"/);
  assert.match(html,/\.brand-name\{[^}]*font:700 17px\/1\.2 Arial,Helvetica,sans-serif/);
  assert.match(html,/@media\(max-width:720px\)[\s\S]*?\.local-badge\{display:none\}/);
  assert.match(html,/#helpDialog > \.dialog-body > h3:first-child\{margin-top:0\}/);
  assert.match(html,/<path d="M4\.5 14\.5v4a2 2/);
});
