'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sourcePath=path.resolve(__dirname,'..','..','MERGED-CURRENT-V2-v27.gs');
const source=()=>fs.readFileSync(sourcePath,'utf8');

test('V2 displays CASE QTY before PACK QTY without changing canonical pack/case semantics',()=>{
  const s=source();
  assert.match(s,/const ORDER_HEADERS = \[\s*'DATE','ORDER BY','PO #','SI #','PRODUCT NAME','ORDER CASE QTY','ORDER PACK QTY'/);
  assert.match(s,/const CANONICAL_ORDER_HEADERS = \[[\s\S]*'ORDER PACK QTY','ORDER CASE QTY'/);
  assert.match(s,/function\s+ensureCaseQtyBeforePackQty_\s*\(/);
  assert.match(s,/function\s+prependCanonicalOrderRows_\s*\(/);
  assert.match(s,/\['Current Stock Cases'\],\['Current Stock Packs'\]/);
  assert.match(s,/\['DATE','ORDER BY','PO #','SI #','CASE QTY','PACK QTY'/);
  assert.match(s,/\['Order Lines'\],\['Order Case Qty'\],\['Order Pack Qty'\]/);
});

test('targeted Wet Wipes 60 repair restores the old opening and two early entries idempotently',()=>{
  const s=source();
  assert.match(s,/function\s+repairWarehouseFollowupData_\s*\(/);
  assert.match(s,/Wet Wipes 60s Plush[\s\S]*7092[\s\S]*1182/);
  assert.match(s,/WATSONS GANADO[\s\S]*9274332[\s\S]*12[\s\S]*2[\s\S]*194\.24/);
  assert.match(s,/PERSONAL[\s\S]*SAMPLE[\s\S]*6[\s\S]*1[\s\S]*26\.6/);
  assert.match(s,/orderRetryKey_/);
  assert.match(s,/REPAIR WAREHOUSE FOLLOWUP DATA/);
});

test('proven old-sheet costs repair only Plush WW60 and Cotton Buds 200/300',()=>{
  const s=source();
  assert.match(s,/'Wet Wipes 60s Plush'\s*:\s*\{\s*unitCost:26\.6\s*,\s*caseCost:159\.6/);
  assert.match(s,/'Cotton Buds 200 Stems Plush'\s*:\s*\{\s*unitCost:16\.5\s*,\s*caseCost:2376/);
  assert.match(s,/'Cotton Buds 300 Stems Plush'\s*:\s*\{\s*unitCost:26\.6\s*,\s*caseCost:1596/);
  assert.match(s,/costPerCase:headerIndex_\(headers,\['COST PER CASE','CASE COST'\],-1\)/);
  assert.match(s,/row\[3\] = number_\(balance\.currentCases\) \* caseCost/);
});

test('Tracker forces visible integer formats for current case and current pack cells',()=>{
  const s=source();
  assert.match(s,/getRange\(dataRow,2,data\.length,2\)\.setNumberFormat\('0'\)/);
});
