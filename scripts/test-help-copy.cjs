'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const argument = process.argv.indexOf('--html');
const file = argument >= 0 ? process.argv[argument + 1] : path.join(__dirname, '../src/index.template.html');
let html = fs.readFileSync(file, 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/)
  || html.match(/const b=atob\(["']([A-Za-z0-9+/=]+)["']\)/)
  || html.match(/const b=["']([A-Za-z0-9+/=]+)["'],raw=Uint8Array/);
if (payload) html = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
assert.match(html, /APP:HELP:BEGIN/, 'Inspect the decoded application, not the self-extract loader');
const excluded = [
  "アーカイブごとに取り出し可能範囲を表示し、大量ファイルは仮想スクロールで軽量表示します。",
  "Archive-level capability shows what can be extracted, very large lists use virtual scrolling, and unknown binaries get a 4 KiB Hex preview."
];
for (const text of excluded) {
  assert.equal(html.includes(text), false, `User-facing help must exclude obsolete audit/implementation copy: ${text}`);
}
console.log('User-facing help copy regression passed.');
