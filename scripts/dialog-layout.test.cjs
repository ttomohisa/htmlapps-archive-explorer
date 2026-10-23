const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const input = process.env.ARCHIVE_DIALOG_SOURCE || 'src/index.template.html';
let source = fs.readFileSync(path.resolve(root, input), 'utf8');
if (input.endsWith('.self-extract.html')) {
  const payload = source.match(/const b=atob\("([A-Za-z0-9+/=]+)"\)/);
  assert.ok(payload, 'self-extract wrapper must contain its gzip payload');
  source = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
}
const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
const help = source.match(/<dialog\b[^>]*id="helpDialog"[^>]*>[\s\S]*?<\/dialog>/)?.[0] || '';

// These source/artifact contracts complement real browser geometry and wheel checks.
// Read declarations in source order so later rules cannot silently undo the repair.
function declarations(selector, stylesheet = css) {
  const result = {};
  for (const [, selectors, body] of stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(',').some(value => value.trim() === selector)) continue;
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon >= 0) result[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
    }
  }
  return result;
}

function mediaBlock(condition) {
  const marker = `@media(${condition})`;
  const start = css.indexOf(marker);
  assert.ok(start >= 0, `${condition} breakpoint must exist`);
  const opening = css.indexOf('{', start);
  let depth = 1;
  for (let end = opening + 1; end < css.length; end++) {
    if (css[end] === '{') depth++;
    if (css[end] === '}' && --depth === 0) return css.slice(opening + 1, end);
  }
  assert.fail(`Unclosed ${condition} breakpoint`);
}

const desktopCss = css.slice(0, css.indexOf('@media'));
const mobileCss = mediaBlock('max-width:720px');
const popoverAt = width => ({
  ...declarations('.filter-popover', desktopCss),
  ...(width <= 720 ? declarations('.filter-popover', mobileCss) : {}),
});

test('mobile filter popover is viewport-anchored with a short-height cap and safe bottom gap', () => {
  const mobile = popoverAt(393);
  assert.equal(mobile.position, 'fixed');
  assert.equal(mobile.left, '14px');
  assert.equal(mobile.right, '14px');
  assert.equal(mobile.width, 'auto');
  assert.equal(mobile.top, 'min(calc(var(--header-height) + 14px),30dvh)');
  assert.equal(mobile['max-height'], 'calc(100dvh - min(calc(var(--header-height) + 14px),30dvh) - max(14px,env(safe-area-inset-bottom)))');
  assert.match(mobileCss, /top:min\(calc\(var\(--header-height\) \+ 14px\),30vh\)/);
  assert.match(mobileCss, /max-height:calc\(100vh - min\(calc\(var\(--header-height\) \+ 14px\),30vh\) - max\(14px,env\(safe-area-inset-bottom\)\)\)/);
  assert.equal(declarations(':root', mobileCss)['--header-height'], '60px');
  assert.equal(declarations('.header-inner', desktopCss)['min-height'], 'var(--header-height)');
  assert.equal(declarations('*', desktopCss)['box-sizing'], 'border-box', 'height cap includes padding and borders');
});

test('mobile filters scroll internally and remain above the fixed navigation bar', () => {
  const mobile = popoverAt(393);
  assert.equal(mobile.overflow, 'auto');
  assert.equal(mobile['overscroll-behavior'], 'contain');
  assert.ok(Number(mobile['z-index']) > Number(declarations('.mobile-bar', mobileCss)['z-index']));
});

test('desktop filter placement and closed hidden state survive the responsive repair', () => {
  const desktop = popoverAt(721);
  assert.equal(desktop.position, 'absolute');
  assert.equal(desktop.top, 'calc(100% + 7px)');
  assert.equal(desktop.right, '0');
  assert.equal(desktop.width, '260px');
  assert.equal(desktop['z-index'], '25');
  assert.equal(desktop['max-height'], undefined);
  assert.equal(desktop.overflow, undefined);
  assert.equal(declarations('.hidden', desktopCss).display, 'none!important');
  assert.equal(declarations('.filter-popover', mobileCss).display, undefined);
  assert.match(source, /class="filter-popover hidden" id="filterPopover"/);
});

function filterHarness() {
  const nodes = {};
  for (const id of ['filterBtn', 'filterPopover', 'filterCount', 'minSize', 'maxSize', 'encryptedOnly', 'warningOnly', 'clearFilters']) {
    const classes = new Set(id === 'filterPopover' ? ['hidden'] : []);
    nodes[id] = {
      attributes: {}, textContent: '',
      setAttribute(key, value) { this.attributes[key] = value; },
      classList: {
        contains: key => classes.has(key),
        add: key => classes.add(key),
        toggle(key, force) {
          const enabled = force === undefined ? !classes.has(key) : force;
          if (enabled) classes.add(key); else classes.delete(key);
          return enabled;
        },
      },
    };
  }
  const events = {};
  const state = { filterMin: '', filterMax: '', encryptedOnly: false, warningOnly: false };
  const context = vm.createContext({
    state, $: selector => nodes[selector.slice(1)],
    document: { addEventListener(name, callback) { events[name] = callback; } },
    // Only open/close is exercised; listing and keyboard navigation have their own contracts.
    syncFilterInputs() {}, renderFiles() {}, keyboardNavigate() {},
  });
  const badge = source.split('\n').find(line => line.startsWith('  function updateFilterBadge()'));
  const handlers = source.split('\n').find(line => line.trimStart().startsWith("$('#filterBtn').onclick="));
  assert.ok(badge && handlers, 'production filter event bindings must exist');
  vm.runInContext(badge + '\n' + handlers, context);
  const click = () => nodes.filterBtn.onclick({ stopPropagation() {} });
  return { nodes, events, click };
}

test('open filters use the same unconditional breakpoint rules on desktop-to-mobile resize', () => {
  const h = filterHarness();
  h.click();
  for (const [width, position] of [[1440, 'absolute'], [720, 'fixed'], [393, 'fixed'], [721, 'absolute']]) {
    assert.equal(h.nodes.filterPopover.classList.contains('hidden'), false);
    assert.equal(h.nodes.filterBtn.attributes['aria-expanded'], 'true');
    assert.equal(popoverAt(width).position, position);
    if (width <= 720) assert.equal(popoverAt(width).top, 'min(calc(var(--header-height) + 14px),30dvh)');
  }
});

test('Escape and outside dismissal can reopen mobile filters without a stale static position', () => {
  const h = filterHarness();
  for (const dismiss of [() => h.events.keydown({ key: 'Escape' }), () => h.events.click()]) {
    h.click();
    assert.equal(h.nodes.filterBtn.attributes['aria-expanded'], 'true');
    dismiss();
    assert.equal(h.nodes.filterPopover.classList.contains('hidden'), true);
    assert.equal(h.nodes.filterBtn.attributes['aria-expanded'], 'false');
    h.click();
    assert.equal(h.nodes.filterPopover.classList.contains('hidden'), false);
    assert.equal(popoverAt(393).top, 'min(calc(var(--header-height) + 14px),30dvh)');
    dismiss();
  }
});

for (const [dialog, container] of [
  ['helpDialog', '#helpDialog'],
  ['exportDialog', '#exportDialog'],
  ['passwordDialog', '#passwordDialog > #passwordForm'],
]) {
  test(`${dialog} is viewport-bounded and becomes a flex column only when open`, () => {
    const open = declarations(`#${dialog}[open]`);
    assert.equal(open.display, 'flex');
    assert.equal(open['flex-direction'], 'column');
    assert.equal(open['max-height'], 'calc(100dvh - 28px)');
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selectors]) =>
      selectors.split(',').some(value => value.trim() === `#${dialog}[open]`));
    assert.match(rule?.[2] || '', /max-height:\s*calc\(100vh - 28px\)/);
    assert.equal(open.overflow, 'hidden');
    assert.equal(declarations(`#${dialog}`).display, undefined, 'closed native dialogs must stay hidden');
    assert.equal(declarations('dialog').display, undefined, 'unrelated dialogs must not be forced open');
  });

  test(`${dialog} body owns scrolling while its header and footer cannot shrink`, () => {
    const body = declarations(`${container} > .dialog-body`);
    assert.equal(body.flex, '1 1 auto');
    assert.equal(body['min-height'], '0');
    assert.equal(body.overflow, 'auto');
    assert.equal(body['overscroll-behavior'], 'contain');
    for (const part of ['.dialog-head', '.dialog-actions']) {
      assert.equal(declarations(`${container} > ${part}`).flex, '0 0 auto');
    }
    assert.equal(declarations('.dialog-body').overflow, undefined, 'containment must stay scoped to the audited dialogs');
  });
}

test('the password form continues the shrink chain without becoming another scroller', () => {
  const form = declarations('#passwordDialog > #passwordForm');
  assert.equal(form.display, 'flex');
  assert.equal(form['flex-direction'], 'column');
  assert.equal(form.flex, '1 1 auto');
  assert.equal(form['min-height'], '0');
  assert.equal(form.overflow, 'hidden');
  assert.match(source, /<form id="passwordForm" method="dialog">/);
  assert.match(source, /id="passwordSubmit" type="submit"/);
});

test('native modal state locks both document scrolling roots', () => {
  for (const selector of ['html:has(dialog:modal)', 'body:has(dialog:modal)']) {
    const rule = declarations(selector);
    assert.equal(rule.overflow, 'hidden');
    assert.equal(rule['overscroll-behavior'], 'none');
  }
  assert.equal(declarations('html:has(dialog[open])').overflow, undefined, 'nonmodal dialogs must not lock the page');
});

test('Help scrolling is keyboard reachable and retains native dismissal controls', () => {
  assert.match(help, /<div class="dialog-body" tabindex="0"/);
  assert.match(help, /<h2 id="helpTitle"/);
  assert.match(help, /<dialog id="helpDialog" aria-labelledby="helpTitle">/);
  assert.equal((help.match(/data-dialog-close/g) || []).length, 2);
  assert.match(help, /data-i18n="close"/);
  assert.ok(source.includes("$('#helpBtn').onclick=()=>$('#helpDialog').showModal()"));
  assert.ok(source.includes("$$('[data-dialog-close]').forEach(b=>b.onclick=()=>$('#helpDialog').close())"));
});

test('the local-processing badge uses a decorative shield and unchanged bilingual labels', () => {
  const badge = source.match(/<div class="local-badge">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(badge, /<svg[^>]*aria-hidden="true"/);
  assert.match(badge, /d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z"/);
  assert.doesNotMatch(badge, /M7 10V7a5 5/);
  assert.match(badge, /data-i18n="localOnly">完全ローカル処理<\/span>/);
  assert.ok(source.includes("localOnly:'Fully local processing'"));
});

test('each checked artifact displays the configured patch version', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
  assert.equal(source.match(/class="version-badge">([^<]+)</)?.[1], `v${config.version}`);
});

test('each checked artifact contains the exact canonical source', () => {
  const canonical = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
  assert.equal(source, canonical, `${input} is stale; synchronize release artifacts from source`);
});

test('phone layouts hide the informational footer without hiding archive navigation', () => {
  assert.equal(declarations('footer', mobileCss).display, 'none');
  assert.notEqual(declarations('footer', desktopCss).display, 'none');
  assert.equal(declarations('.mobile-bar', mobileCss).display, 'grid');
  assert.equal(declarations('.mobile-bar', mobileCss).position, 'fixed');
  assert.match(declarations('main', desktopCss).padding, /92px$/,
    'the file workspace must retain clearance for the fixed mobile action bar');
  const footer = source.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0] || '';
  assert.doesNotMatch(footer, /<(?:button|input|select)\b/,
    'only informational content belongs in the hidden footer');
});
