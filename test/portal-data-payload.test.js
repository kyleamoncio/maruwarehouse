'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8').replace(/\r\n/g, '\n');
function load(name, context) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const end = source.indexOf('\n}', start) + 2;
  vm.runInContext(source.slice(start, end), context);
}
test('actual payload mapping preserves independent quantities and edited authoritative Summary', () => {
  const renders = [];
  const c = vm.createContext({
    allData: [], summaryData: [], filteredData: [],
    renderDashboard: () => renders.push('dashboard'),
    renderAllData: () => renders.push('search'),
    renderSummary: () => renders.push('summary')
  });
  load('applyPortalDataPayload', c);
  c.applyPortalDataPayload({
    data: [['2026-09-30','Buyer','order-po','order-si',30,0,115.2,3456,1178.7,2277.3,'Product']],
    summary: [['2026-09-30','Edited Buyer','manual-po','manual-si','ITEM',3456,1178.7,2277.3,'TBA']]
  });
  assert.equal(c.allData[0].packs, 30);
  assert.equal(c.allData[0].cases, 0);
  assert.equal(c.allData[0].total, 3456);
  assert.equal(c.summaryData[0].buyer, 'Edited Buyer');
  assert.equal(c.summaryData[0].po, 'manual-po');
  assert.equal(c.summaryData[0].si, 'manual-si');
  assert.equal(c.summaryData[0].due, 'TBA');
  assert.equal(c.filteredData.length, 1);
  assert.deepEqual(renders, ['dashboard','search','summary']);
});
test('missing or malformed top-level data does not replace existing loaded rows', () => {
  const original = [{po:'existing'}];
  const c = vm.createContext({allData: original});
  load('applyPortalDataPayload', c);
  for (const payload of [null, {}, {data:'wrong'}, {data:{}}]) {
    assert.throws(() => c.applyPortalDataPayload(payload), /No data returned/);
    assert.equal(c.allData, original);
  }
});
