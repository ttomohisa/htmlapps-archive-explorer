const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.resolve(root, process.env.ARCHIVE_HEADER_SOURCE || 'src/index.template.html'), 'utf8');

function harness() {
  const node = (dataset = {}) => ({ dataset, textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
  const nodes = { langBtn: node(), helpBtn: node(), searchInput: node(), localBadge: node({ i18n: 'localOnly' }) };
  const state = { lang: 'ja', file: { name: 'example.zip' }, selected: new Set(['keep.txt']), search: 'keep', cwd: 'notes' };
  const document = { documentElement: {} };
  const context = vm.createContext({
    state, document,
    $: selector => nodes[selector.slice(1)],
    $$: selector => selector === '[data-i18n]' ? [nodes.localBadge] : [],
    // The real language update runs; archive rendering is outside this header contract.
    renderAll() {},
  });
  const translations = source.slice(source.indexOf('  const I = {'), source.indexOf('  const $ ='));
  const update = source.slice(source.indexOf('  function t('), source.indexOf('  function icon('));
  assert.ok(translations && update, 'production language declarations must exist');
  vm.runInContext(translations + update, context);
  return { context, nodes, state, document };
}

test('language targets remain EN / JA with localized action labels and matching tooltips', () => {
  const h = harness();
  for (const [lang, label, action] of [['ja', 'EN', '英語に切り替え'], ['en', 'JA', 'Switch to Japanese'], ['ja', 'EN', '英語に切り替え']]) {
    h.state.lang = lang;
    h.context.applyI18n();
    assert.equal(h.nodes.langBtn.textContent, label);
    assert.equal(h.nodes.langBtn.attributes['aria-label'], action);
    assert.equal(h.nodes.langBtn.title, action);
    assert.equal(h.document.documentElement.lang, lang);
  }
});

test('privacy badge uses the standard fully local wording in both languages', () => {
  const h = harness();
  for (const [lang, label] of [['ja', '完全ローカル処理'], ['en', 'Fully local processing']]) {
    h.state.lang = lang;
    h.context.applyI18n();
    assert.equal(h.nodes.localBadge.textContent, label);
  }
});

test('switching language preserves the selected archive and current exploration state', () => {
  const h = harness();
  const file = h.state.file;
  const selected = h.state.selected;
  h.state.lang = 'en';
  h.context.applyI18n();
  assert.equal(h.state.file, file);
  assert.equal(h.state.selected, selected);
  assert.deepEqual([...selected], ['keep.txt']);
  assert.equal(h.state.search, 'keep');
  assert.equal(h.state.cwd, 'notes');
});

test('initial header has the canonical semantic version and localized target label', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
  assert.match(config.version, /^\d+\.\d+\.\d+$/);
  const version = source.match(/class="version-badge">([^<]+)</);
  assert.equal(version?.[1], `v${config.version}`);
  assert.match(source.match(/<button[^>]*id="langBtn"[^>]*>.*?<\/button>/)?.[0] || '', /id="langBtn"[^>]*aria-label="英語に切り替え"[^>]*title="英語に切り替え"[^>]*>EN<\/button>/);
  assert.match(source.match(/<span[^>]*data-i18n="localOnly"[^>]*>.*?<\/span>/)?.[0] || '', /data-i18n="localOnly">完全ローカル処理<\/span>/);
});
