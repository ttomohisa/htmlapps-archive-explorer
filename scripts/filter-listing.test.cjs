const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, process.env.ARCHIVE_LISTING_SOURCE || 'src/index.template.html'), 'utf8');

// Evaluate only these listing/UI declarations, never the app script or initializer.
// All entries below are invented plain metadata; there are no archive bytes or files.
const listingFunctions = [
  'parseSizeValue', 'parseSearchQuery', 'filteredItems', 'fileListContextKey',
  'directItems', 'folderSize', 'ratio', 'entryHasWarning', 'renderFiles',
  'syncFilterInputs', 'updateFilterBadge', 'updateSelectionBar', 'updateSaveLabel',
  'hasActiveListFilters', 'clearSearchAndFilters',
];
function declaration(name) {
  const marker = `  function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const rest = source.slice(start);
  const next = rest.slice(marker.length).search(/\n  (?=(?:async )?function |const |let )/);
  assert.ok(next >= 0, `Missing declaration boundary for ${name}`);
  return rest.slice(0, marker.length + next);
}
function element() {
  const classes = new Set();
  return {
    value: '', checked: false, textContent: '', innerHTML: '', scrollTop: 0,
    focused: false, attributes: {},
    focus() { this.focused = true; },
    setAttribute(name, value) { this.attributes[name] = value; },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, enabled) {
        if (enabled ?? !classes.has(name)) classes.add(name);
        else classes.delete(name);
      },
    },
  };
}
function harness(overrides = {}) {
  const state = {
    lang: 'en', entries: [], cwd: '', active: null, selected: new Set(),
    search: '', typeFilter: 'all', filterMin: '', filterMax: '',
    encryptedOnly: false, warningOnly: false, warnings: [],
    sortKey: 'name', sortDir: 'asc', keyboardPath: null,
    virtualItems: [], virtualized: false, virtualStart: -1, listContextKey: '',
    ...overrides,
  };
  const nodes = Object.fromEntries([
    'fileList', 'searchInput', 'typeFilter', 'minSize', 'maxSize',
    'encryptedOnly', 'warningOnly', 'filterCount', 'filterBtn',
    'filterPopover', 'selectionBar', 'selectionText', 'mobileSave',
  ].map(id => [id, element()]));
  const reset = element();
  nodes.fileList.querySelector = selector => {
    assert.equal(selector, '[data-clear-search-filters]');
    return nodes.fileList.innerHTML.includes('data-clear-search-filters') ? reset : null;
  };
  const dirname = name => name.split('/').slice(0, -1).join('/');
  const extOf = name => name.split('.').at(-1).toLowerCase();
  const context = vm.createContext({
    state, VIRTUAL_THRESHOLD: 250,
    $: selector => {
      assert.ok(nodes[selector.slice(1)], `Unexpected DOM access: ${selector}`);
      return nodes[selector.slice(1)];
    },
    $$: selector => { assert.equal(selector, '[data-sort]'); return []; },
    dirname, extOf,
    classify: name => ({ png: 'image', txt: 'text', js: 'code', pdf: 'pdf' }[extOf(name)] || 'other'),
    // Inert rendering dependencies: no inspector, preview, extraction or app init.
    esc: value => String(value),
    t: key => ({ emptyFolder: 'No matching items in this folder.', clearSearchAndFilters: 'Clear search and filters' }[key] || key),
    rowHtml: entry => `<div>${entry.name}</div>`,
    fileRowHeight: () => 45,
    renderVirtualWindow: () => { throw new Error('Virtual rendering is outside these small metadata fixtures'); },
  });
  vm.runInContext(listingFunctions.map(declaration).join('\n'), context);
  Object.assign(nodes.searchInput, { value: state.search });
  Object.assign(nodes.typeFilter, { value: state.typeFilter });
  context.syncFilterInputs();
  return { state, nodes, reset, context, names: () => Array.from(context.filteredItems(), e => e.name) };
}
const entry = (name, size, extra = {}) => ({ name: name.split('/').at(-1), path: name, size, dir: false, ...extra });

test('existing text, type and metadata flags combine within the current subtree', () => {
  const h = harness({
    cwd: 'notes', search: 'report', typeFilter: 'text', encryptedOnly: true, warningOnly: true,
    entries: [entry('notes/report.txt', 10, { encrypted: true }), entry('other/report.txt', 10, { encrypted: true }), entry('notes/report.png', 10, { encrypted: true }), entry('notes/plain.txt', 10)],
    warnings: [{ arr: [{ path: 'notes/report.txt' }, { path: 'other/report.txt' }, { path: 'notes/report.png' }] }],
  });
  assert.deepEqual(h.names(), ['report.txt']);
});

test('visible minimum remains effective when the query minimum is looser', () => {
  const h = harness({ search: '>1KB', filterMin: '2KB', entries: [entry('small.txt', 1500), entry('edge.txt', 2048), entry('large.txt', 3000)] });
  assert.deepEqual(h.names(), ['edge.txt', 'large.txt']);
});

test('visible maximum remains effective when the query maximum is looser', () => {
  const h = harness({ search: '<3KB', filterMax: '2KB', entries: [entry('small.txt', 1500), entry('edge.txt', 2048), entry('large.txt', 2500)] });
  assert.deepEqual(h.names(), ['edge.txt', 'small.txt']);
});

test('tighter query bounds and inclusive equality are preserved', () => {
  const h = harness({ search: '>2KB <2KB', filterMin: '1KB', filterMax: '3KB', entries: [entry('below.txt', 2047), entry('equal.txt', 2048), entry('above.txt', 2049)] });
  assert.deepEqual(h.names(), ['equal.txt']);
});

test('contradictory query and visible bounds produce no matches', () => {
  const h = harness({ search: '>1KB <3KB', filterMin: '4KB', entries: [entry('between.txt', 2048), entry('large.txt', 5000)] });
  assert.deepEqual(h.names(), []);
});

test('zero and invalid size inputs keep existing nullable-bound behavior', () => {
  const h = harness({ search: '<1KB', filterMax: '0', entries: [entry('zero.txt', 0), entry('one.txt', 1)] });
  assert.deepEqual(h.names(), ['zero.txt']);
  h.state.filterMax = 'not-a-size';
  assert.deepEqual(h.names(), ['one.txt', 'zero.txt']);
  h.state.search = '';
  assert.deepEqual(h.names(), ['one.txt', 'zero.txt']);
});

for (const filter of [
  { search: 'missing' }, { typeFilter: 'image' }, { filterMin: '2KB' },
  { filterMax: '1KB' }, { encryptedOnly: true }, { warningOnly: true },
]) {
  test(`zero results offer a native reset button for ${Object.keys(filter)[0]}`, () => {
    const h = harness(filter);
    h.context.renderFiles();
    assert.match(h.nodes.fileList.innerHTML, /<button\b[^>]*type="button"[^>]*data-clear-search-filters[^>]*>Clear search and filters<\/button>/);
    assert.equal(typeof h.reset.onclick, 'function');
  });
}

test('unfiltered empty folders and whitespace-only search offer no reset', () => {
  for (const search of ['', '   ']) {
    const h = harness({ search });
    h.context.renderFiles();
    assert.match(h.nodes.fileList.innerHTML, /No matching items/);
    assert.doesNotMatch(h.nodes.fileList.innerHTML, /data-clear-search-filters/);
  }
});

test('reset clears all filter controls and preserves folder, sorting and selection', () => {
  const selected = new Set(['notes/keep.txt']);
  const h = harness({
    cwd: 'notes', sortKey: 'size', sortDir: 'desc', selected, active: 'notes/keep.txt',
    search: 'missing', typeFilter: 'image', filterMin: '8KB', filterMax: '2KB',
    encryptedOnly: true, warningOnly: true,
    entries: [entry('notes/keep.txt', 1), entry('notes/larger.txt', 2), entry('elsewhere.txt', 3)],
    virtualized: true, virtualItems: [entry('old.txt', 1)], virtualStart: 8,
  });
  h.nodes.fileList.classList.add('virtualized');
  h.context.renderFiles();
  assert.equal(h.state.virtualized, false);
  assert.equal(h.state.virtualItems.length, 0);
  assert.equal(h.nodes.fileList.classList.contains('virtualized'), false);
  assert.equal(typeof h.reset.onclick, 'function', 'zero-result recovery must be actionable');
  h.reset.onclick();
  for (const key of ['search', 'filterMin', 'filterMax']) assert.equal(h.state[key], '');
  assert.equal(h.state.typeFilter, 'all');
  assert.equal(h.state.encryptedOnly, false);
  assert.equal(h.state.warningOnly, false);
  for (const key of ['searchInput', 'minSize', 'maxSize']) assert.equal(h.nodes[key].value, '');
  assert.equal(h.nodes.typeFilter.value, 'all');
  assert.equal(h.nodes.encryptedOnly.checked, false);
  assert.equal(h.nodes.warningOnly.checked, false);
  assert.equal(h.nodes.filterCount.textContent, '');
  assert.equal(h.nodes.filterBtn.classList.contains('active'), false);
  assert.equal(h.state.cwd, 'notes');
  assert.equal(h.state.sortKey, 'size');
  assert.equal(h.state.sortDir, 'desc');
  assert.equal(h.state.active, 'notes/keep.txt');
  assert.equal(h.state.selected, selected);
  assert.deepEqual([...selected], ['notes/keep.txt']);
  assert.deepEqual(h.names(), ['larger.txt', 'keep.txt']);
  assert.doesNotMatch(h.nodes.fileList.innerHTML, /data-clear-search-filters/);
  assert.equal(h.nodes.searchInput.focused, true);
  h.reset.onclick();
  assert.deepEqual(h.names(), ['larger.txt', 'keep.txt'], 'repeated reset is harmless');
});

test('matching filtered results do not show the reset action', () => {
  const h = harness({ search: 'keep', entries: [entry('keep.txt', 2)] });
  h.context.renderFiles();
  assert.match(h.nodes.fileList.innerHTML, /keep.txt/);
  assert.doesNotMatch(h.nodes.fileList.innerHTML, /data-clear-search-filters/);
});

test('both languages explain combined size filters and zero-result recovery', () => {
  assert.ok(source.includes("clearSearchAndFilters:'検索と絞り込みをクリア'"), 'Japanese reset label');
  assert.ok(source.includes("clearSearchAndFilters:'Clear search and filters'"), 'English reset label');
  assert.ok(source.includes('検索のサイズ条件と絞り込みの最小・最大サイズは同時に適用'), 'Japanese combined-filter help');
  assert.ok(source.includes('Search size shortcuts and minimum/maximum size filters apply together'), 'English combined-filter help');
  const en = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const ja = fs.readFileSync(path.join(root, 'README.ja.md'), 'utf8');
  assert.match(en, /Clear search and filters/);
  assert.match(en, /current folder, sort order, and selected files/);
  assert.match(ja, /検索と絞り込みをクリア/);
  assert.match(ja, /現在のフォルダ・並び順・ファイル選択/);
});
