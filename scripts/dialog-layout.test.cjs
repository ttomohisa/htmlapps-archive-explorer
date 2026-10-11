const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
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
function declarations(selector) {
  const result = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(',').some(value => value.trim() === selector)) continue;
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon >= 0) result[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
    }
  }
  return result;
}

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
