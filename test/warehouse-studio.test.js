'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const addon = fs.readFileSync(path.join(root, 'public/warehouse-studio.js'), 'utf8');

test('Studio uses a separate presentation layer and retains the real navigation and bridge', () => {
  assert.match(html, /id="warehouse-studio-body"/);
  assert.match(html, /warehouse-studio\.css/);
  assert.match(html, /warehouse-studio\.js/);
  assert.match(html, /DEFAULT_API_URL = '\/api\/sheets'/);
  for (const page of ['dashboard','search','summary','entry','restock','settings']) {
    assert.match(html, new RegExp(`data-page="${page}" onclick="navigate\\('${page}'\\)"`));
  }
  assert.match(html, /data-page="alldata"[^>]*style="display:none"/);
  assert.match(html, /id="portalViewModeToggle"/);
  assert.match(html, /onclick="submitEntry\(\)"/);
  assert.match(html, /onclick="submitRestock\(\)"/);
  assert.doesNotMatch(addon, /\bfetch\s*\(|localStorage|submitEntry\s*=|submitRestock\s*=/);
});

test('trash decoration retains hidden state, onclick and native button semantics', () => {
  const dom = new JSDOM(html, {runScripts:'outside-only',url:'http://127.0.0.1:8001/'});
  dom.window.eval(addon);
  const button = dom.window.document.querySelector('[onclick="removeEntryLine(this)"]');
  assert.equal(button.getAttribute('onclick'), 'removeEntryLine(this)');
  assert.equal(button.type, 'button');
  assert.equal(button.style.display, 'none');
  assert.ok(button.querySelector('svg[aria-hidden="true"]'));
  assert.equal(button.getAttribute('aria-label'), 'Remove');
  assert.ok(button.classList.contains('studio-remove-button'));
  dom.window.close();
});

test('document X preserves its original close workflow and accessible name', () => {
  const dom = new JSDOM(html, {runScripts:'outside-only',url:'http://127.0.0.1:8001/'});
  dom.window.eval(addon);
  const button = dom.window.document.querySelector('[onclick="WarehousePO.closeModal()"]');
  assert.ok(button.querySelector('svg'));
  assert.equal(button.type,'button');
  assert.equal(button.getAttribute('onclick'),'WarehousePO.closeModal()');
  assert.equal(button.getAttribute('aria-label'),'Close');
  let clicked = 0;
  button.addEventListener('click', () => clicked++);
  button.click();
  assert.equal(clicked,1);
  dom.window.close();
});

test('workspace chooser dismisses by Escape without touching Warehouse view functions', () => {
  const dom = new JSDOM(html, {runScripts:'outside-only',url:'http://127.0.0.1:8001/'});
  dom.window.eval(addon);
  const chooser = dom.window.document.querySelector('.studio-workspace-menu');
  chooser.open = true;
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(chooser.open,false);
  assert.equal(dom.window.document.activeElement,chooser.querySelector('summary'));
  dom.window.close();
});

test('native buyer text enhancement preserves selection/options/change hook and survives option rebuild', async () => {
  const dom = new JSDOM(html, {runScripts:'outside-only',url:'http://127.0.0.1:8001/'});
  dom.window.CSS = {supports: () => true};
  const buyer = dom.window.document.getElementById('e-buyer');
  const option = new dom.window.Option('FAST LOGISITCS CORPORATION', 'FAST');
  buyer.append(option);
  buyer.value = 'FAST';
  const change = buyer.getAttribute('onchange');
  dom.window.eval(addon);
  assert.ok(buyer.querySelector('button > selectedcontent'));
  assert.equal(buyer.value, 'FAST');
  assert.equal(buyer.options.length, 2);
  assert.equal(buyer.options[1], option);
  assert.equal(buyer.getAttribute('onchange'), change);
  buyer.replaceChildren(...Array.from(buyer.options));
  buyer.value = 'FAST';
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.equal(buyer.querySelectorAll('button').length, 1);
  assert.equal(buyer.value, 'FAST');
  assert.equal(buyer.options[1], option);
  assert.equal(buyer.getAttribute('onchange'), change);
  dom.window.close();
});

test('read-only preview badge is local-only and absent on production', () => {
  for (const [url, visible] of [['http://127.0.0.1:8001/', true], ['https://maruwarehouse.vercel.app/', false]]) {
    const dom = new JSDOM(html, {runScripts:'outside-only',url});
    dom.window.eval(addon);
    assert.equal(Boolean(dom.window.document.querySelector('.studio-preview-tag')), visible);
    dom.window.close();
  }
});
