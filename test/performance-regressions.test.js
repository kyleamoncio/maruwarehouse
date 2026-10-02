'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const apiSource = fs.readFileSync(path.resolve(__dirname, '..', 'api', 'sheets.js'), 'utf8');

function extractFunction(name, text = source) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(text);
  assert.ok(match, `${name} must exist`);
  const start = match.index;
  const paramsStart = text.indexOf('(', start);
  let depth = 0;
  let paramsEnd;
  for (let i = paramsStart; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) { paramsEnd = i; break; }
  }
  const brace = text.indexOf('{', paramsEnd);
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function restockContext(fetch) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<section hidden><select id="e-buyer"><option>PERSONAL</option></select>
    <div data-entry-line><select class="entry-product"><option>Fluffy Test</option></select>
    <input class="entry-price" value="123.45"><span class="entry-price-hint"></span></div></section>
    <input id="r-date" value="2026-10-01"><button id="restockSubmit"></button>
    <div id="restockValidationSummary"></div><div data-restock-line>
    <select class="restock-product"><option value="">Select Product...</option><option selected>Fluffy Test</option></select>
    <input class="restock-cases" value="2"><input class="restock-packs" value="20"><div class="restock-impact"></div></div>`);
  const document = dom.window.document;
  const context = vm.createContext({
    document, Option: dom.window.Option, fetch, SCRIPT_URL: '/api/sheets',
    restockSaveInProgress: false, restockProductsLoadPromise: null, restockPacksPerCase: { 'Fluffy Test': 10 },
    v2ReferenceLoadPromise: null, PRICES: { 'Fluffy Test': { PERSONAL: 100 } },
    PRICE_UNITS: {}, PACKS_PER_CASE: {}, COSTS: {}, BUYERS: [],
    normalizeBuyerList: buyers => buyers, canonicalPortalBuyer: buyer => buyer,
    displayProductName: name => name, getEntryPriceUnit: () => 'PACK',
    getEntryLineElements: () => [...document.querySelectorAll('[data-entry-line]')],
    getEntryLineValue: (line, key) => line.querySelector(`.entry-${key}`).value,
    populateDropdowns() {}, renderBuyerPills() {}, renderPriceReference() {}, updatePreview() {},
    showToast() {}, setTimeout: fn => fn()
  });
  for (const name of ['fetchV2BootstrapResult', 'applyV2ReferenceData', 'loadV2ReferenceData',
    'autoFillPrice', 'syncEntryLinePriceMode', 'isNoRevenueBuyer', 'populateProductSelect',
    'loadRestockProducts', 'getRestockLines', 'updateRestockLineImpact', 'updateRestockSubmitState']) {
    vm.runInContext(extractFunction(name), context);
  }
  context.updateRestockLineImpact(document.querySelector('[data-restock-line]'));
  return { context, document, close: () => dom.window.close() };
}

function bootstrapResponse(packsPerCase = 10, name = 'Fluffy Test') {
  return { ok: true, json: async () => ({ success: true, products: [{ name, packsPerCase, defaultSrp: 100 }], buyers: ['PERSONAL'] }) };
}

test('Restock reference refresh does not reprice a hidden unsaved New Entry', async () => {
  const fixture = restockContext(async (url, options) => {
    assert.equal(url, '/api/sheets');
    assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(JSON.parse(options.body), { action: 'getV2Bootstrap' });
    return bootstrapResponse();
  });
  try {
    await fixture.context.loadRestockProducts();
    assert.equal(fixture.document.querySelector('.entry-price').value, '123.45');
  } finally { fixture.close(); }
});

test('Restock reads deduplicate only in flight and release the lock after failure', async () => {
  let calls = 0;
  let resolve;
  const fixture = restockContext(() => { calls++; return new Promise(done => { resolve = done; }); });
  try {
    const first = fixture.context.loadRestockProducts();
    const second = fixture.context.loadRestockProducts();
    assert.equal(calls, 1);
    resolve(bootstrapResponse());
    await Promise.all([first, second]);
    const next = fixture.context.loadRestockProducts();
    assert.equal(calls, 2);
    resolve(bootstrapResponse());
    await next;
    fixture.context.fetch = async () => { calls++; throw Error('offline'); };
    await fixture.context.loadRestockProducts();
    assert.equal(calls, 4);
    assert.equal(fixture.context.restockProductsLoadPromise, null);
    fixture.context.fetch = async () => { calls++; return bootstrapResponse(); };
    await fixture.context.loadRestockProducts();
    assert.equal(calls, 5);
  } finally { fixture.close(); }
});

test('Restock refresh clears obsolete product preview and disables submit without losing quantities', async () => {
  const fixture = restockContext(async () => bootstrapResponse(12, 'Fluffy Replacement'));
  const { context, document } = fixture;
  try {
    assert.equal(document.getElementById('restockSubmit').disabled, false);
    assert.match(document.querySelector('.restock-impact').textContent, /This restock adds/);
    await context.loadRestockProducts();
    assert.equal(document.querySelector('.restock-product').value, '');
    assert.equal(document.getElementById('restockSubmit').disabled, true);
    assert.equal(document.querySelector('.restock-impact').textContent, 'Select a product and quantity to preview this restock.');
    assert.equal(document.getElementById('restockValidationSummary').classList.contains('is-ready'), false);
    assert.equal(document.querySelector('.restock-cases').value, '2');
    assert.equal(document.querySelector('.restock-packs').value, '20');
  } finally { fixture.close(); }
});

test('Restock refresh preserves valid selections and quantities but updates packs-per-case preview', async () => {
  const fixture = restockContext(async () => bootstrapResponse(12));
  const { context, document } = fixture;
  try {
    await context.loadRestockProducts();
    assert.equal(document.querySelector('.restock-product').value, 'Fluffy Test');
    assert.equal(document.querySelector('.restock-cases').value, '2');
    assert.equal(document.querySelector('.restock-packs').value, '20');
    assert.equal(document.getElementById('restockSubmit').disabled, false);
    assert.match(document.querySelector('.restock-impact').textContent, /12 packs\/case reference/);
  } finally { fixture.close(); }
});

function referenceContext(fetchBootstrap) {
  const noop = () => {};
  return vm.createContext({
    v2ReferenceLoadPromise: null,
    fetchV2BootstrapResult: fetchBootstrap,
    applyV2ReferenceData: noop, populateDropdowns: noop, renderBuyerPills: noop,
    renderPriceReference: noop, getEntryLineElements: () => [], updatePreview: noop,
    showToast: noop
  });
}

test('references deduplicate concurrent requests but refresh after completion', async () => {
  let calls = 0;
  let resolve;
  const context = referenceContext(() => { calls++; return new Promise(done => { resolve = done; }); });
  vm.runInContext(extractFunction('loadV2ReferenceData'), context);
  const first = context.loadV2ReferenceData();
  const second = context.loadV2ReferenceData(true);
  assert.equal(calls, 1);
  const payload = { products: [] };
  resolve(payload);
  assert.equal(await first, payload);
  assert.equal(await second, payload);
  const next = context.loadV2ReferenceData();
  assert.equal(calls, 2);
  resolve({ products: ['fresh'] });
  await next;
});

test('failed reference requests release the in-flight lock', async () => {
  let calls = 0;
  const context = referenceContext(async () => { calls++; if (calls === 1) throw Error('offline'); return {}; });
  vm.runInContext(extractFunction('loadV2ReferenceData'), context);
  await assert.rejects(context.loadV2ReferenceData(), /offline/);
  await context.loadV2ReferenceData();
  assert.equal(calls, 2);
});

test('startup removes legacy snapshot and starts independent reads without waiting', () => {
  assert.doesNotMatch(source, /PORTAL_DATA_CACHE|persistPortalDataCache|restoreCachedPortalData|updatePortalDataSyncStatus|initialPortalDataLoadPromise|v2ReferenceDataResult/);
  const start = source.indexOf("document.addEventListener('DOMContentLoaded', () => {");
  const end = source.indexOf('\n});', start);
  const startup = source.slice(start, end + 4);
  const calls = [];
  const context = vm.createContext({
    document: { addEventListener: (_, fn) => fn(), querySelector: () => null },
    updateSearchScrollCue() {},
    localStorage: { removeItem: key => calls.push(key) },
    window: { innerWidth: 1024, addEventListener() {} },
    loadV2ReferenceData: () => { calls.push('references'); return new Promise(() => {}); },
    loadAllData: () => { calls.push('data'); return new Promise(() => {}); }
  });
  for (const name of startup.matchAll(/\b([A-Za-z]\w*)\(/g)) {
    if (!(name[1] in context)) context[name[1]] = () => {};
  }
  vm.runInContext(startup, context);
  assert.ok(calls.includes('maruWarehousePortalDataV1'));
  assert.ok(calls.includes('references'));
  assert.ok(calls.includes('data'));
  assert.doesNotMatch(extractFunction('navigate'), /initialPortalDataLoadPromise/);
  assert.match(extractFunction('navigate'), /loadV2ReferenceData\(/);
  assert.doesNotMatch(extractFunction('loadRestockProducts'), /if\s*\(restockProductsLoaded\)\s*return/);
  assert.match(extractFunction('loadRestockProducts'), /await fetchV2BootstrapResult\(/);
  assert.doesNotMatch(extractFunction('loadRestockProducts'), /loadV2ReferenceData\(/);
});

test('live data reads retry once, deduplicate callers and never persist payloads', async () => {
  let calls = 0;
  let applied = 0;
  const payload = { data: [], summary: [] };
  const context = vm.createContext({
    SCRIPT_URL: '/api/sheets', portalDataLoadPromise: null,
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, '/api/sheets?action=getAllData');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.method, undefined);
      if (calls === 1) throw Error('offline');
      return { ok: true, json: async () => payload };
    },
    setTimeout: fn => fn(), showToast() {},
    applyPortalDataPayload: result => { assert.equal(result, payload); applied++; },
    localStorage: new Proxy({}, { get() { throw Error('No persistent storage allowed'); } })
  });
  vm.runInContext(extractFunction('fetchPortalDataResult') + '\n' + extractFunction('loadAllData'), context);
  assert.deepEqual(await Promise.all([context.loadAllData(), context.loadAllData()]), [true, true]);
  assert.equal(calls, 2);
  assert.equal(applied, 1);
  await context.loadAllData();
  assert.equal(calls, 3);
  assert.equal(applied, 2);
  context.fetch = async () => { calls++; throw Error('still offline'); };
  assert.equal(await context.loadAllData(), false);
  assert.equal(calls, 5);
  assert.equal(context.portalDataLoadPromise, null);
});

test('mutation transport failures are never retried and skip the legacy write', async () => {
  for (const action of ['appendProducts', 'appendToProduct']) {
    let writes = 0;
    const context = vm.createContext({
      getV2Health: async () => ({ version: 'supported' }),
      ORDER_SAFE_V2_VERSIONS: new Set(['supported']),
      V2_APPS_SCRIPT_URL: 'v2', V2_API_TOKEN: 'test',
      forwardToAppsScript: async () => { writes++; throw Error('timeout'); }
    });
    vm.runInContext(extractFunction('dualWrite', apiSource), context);
    const result = await context.dualWrite(action, { requestId: 'test' });
    assert.equal(writes, 1);
    assert.equal(result.success, false);
    assert.equal(result.sync.original.skipped, true);
  }
  assert.doesNotMatch(apiSource, /v2HealthCache|v2HealthPromise|rememberV2Health/);
});

test('proven unreachable and duplicate render work remains removed', () => {
  assert.doesNotMatch(extractFunction('renderOverviewStats'), /return;\s*spotlight\.innerHTML/);
  const applySaved = extractFunction('applySavedEntriesLocally');
  assert.match(applySaved, /renderDashboard\(\)/);
  assert.match(applySaved, /renderAllData\(\)/);
  assert.doesNotMatch(applySaved, /renderEntryRecent\(\)/);
});
