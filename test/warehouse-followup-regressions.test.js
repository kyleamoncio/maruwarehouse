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
  const migration=s.match(/function\s+ensureCaseQtyBeforePackQty_\s*\([\s\S]*?\n\}/);
  assert.ok(migration,'CASE/PACK migration missing');
  assert.doesNotMatch(migration[0],/moveColumns|breakApart/);
  assert.match(migration[0],/caseRange\.setValues\(packContents\)/);
  assert.match(migration[0],/packRange\.setValues\(caseContents\)/);
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
  assert.match(s,/new Date\(2026,2,10\),'PERSONAL','PERSONAL','PERSONAL',product,6,1,289,1734,123\.52,741\.12,992\.88/);
  assert.match(s,/orderRetryKey_/);
  assert.match(s,/REPAIR WAREHOUSE FOLLOWUP DATA/);
});

test('Product Master repair preserves Plush WW60 and corrects only Cotton Buds 200/300',()=>{
  const s=source();
  const costRepairs=s.match(/const costRepairs = Object\.freeze\(\{[\s\S]*?\n\s*\}\);/);
  assert.ok(costRepairs,'cost repair map missing');
  assert.doesNotMatch(costRepairs[0],/Wet Wipes 60s Plush/);
  assert.match(s,/new Date\(2026,1,26\)[\s\S]*26\.6,319\.20,2011\.70/);
  assert.match(s,/'Cotton Buds 200 Stems Plush'\s*:\s*\{\s*unitCost:16\.5\s*,\s*caseCost:2376/);
  assert.match(s,/'Cotton Buds 300 Stems Plush'\s*:\s*\{\s*unitCost:26\.6\s*,\s*caseCost:1596\s*,\s*allowedUnit:\[0,/);
  assert.match(s,/costPerCase:headerIndex_\(headers,\['COST PER CASE','CASE COST'\],-1\)/);
  assert.match(s,/row\[3\] = number_\(balance\.currentCases\) \* caseCost/);
});

test('Tracker forces visible integer formats for current case and current pack cells',()=>{
  const s=source();
  assert.match(s,/getRange\(dataRow,2,data\.length,2\)\.setNumberFormat\('0'\)/);
});

test('production proxy exposes Version 47 restocks and guarded repairs',()=>{
  const proxy=fs.readFileSync(path.resolve(__dirname,'..','api','sheets.js'),'utf8');
  assert.match(proxy,/"2026-08-18\.48"\]\.includes\(health\.version\)/);
  assert.match(proxy,/\["setupPersonalTab", "setupViews", "repairWarehouseFollowupData", "repairWarehousePresentationData", "repairHistoricalPersonalData", "repairBuyerViewPresentation"\][\s\S]*55000/);
});

test('every V2 sheet that exposes case and pack puts CASE first without relabelling data',()=>{
  const s=source();
  assert.match(s,/const SNAPSHOT_HEADERS = \[[\s\S]*'COUNTED CASE QTY','COUNTED BASE QTY PACKS'/);
  assert.match(s,/function\s+ensureSnapshotCaseQtyBeforePackQty_\s*\(/);
  assert.match(s,/ensureCaseQtyBeforePackQty_\(ss\)[\s\S]*ensureSnapshotCaseQtyBeforePackQty_\(ss\)/);
  assert.match(s,/const RESTOCK_HEADERS = \['DATE','PRODUCT NAME','CASE QTY','PACK QTY'\]/);
  assert.match(s,/headers:\['PRODUCT','CURRENT CASE','CURRENT PACK'/);
  assert.match(s,/\['DATE','ORDER BY','PO #','SI #','CASE QTY','PACK QTY'/);
  assert.match(s,/\['Order Lines'\],\['Order Case Qty'\],\['Order Pack Qty'\]/);
});

test('Summary and product activity are newest-first while full Summary rows including documents stay together',()=>{
  const s=source();
  assert.match(s,/function\s+sortSummaryRowsNewestFirst_\s*\(/);
  assert.match(s,/getRange\(layout\.headerRow\+1,1,rowCount,sheet\.getLastColumn\(\)\)\.sort/);
  assert.match(s,/function\s+applySummarySyncPlan_[\s\S]*sortSummaryRowsNewestFirst_\(plan\.sheet\)/);
  assert.match(s,/order by Col1 desc/);
});

test('views show TBA only for blank PO or SI while preserving submitted text and replacing SAMPLE with PERSONAL',()=>{
  const s=source();
  assert.match(s,/function\s+viewIdentityFormula_\s*\(/);
  assert.match(s,/entry\.po\|\|''\s*,\s*entry\.si\|\|''/);
  assert.match(s,/function\s+replaceExactSampleCellsWithPersonal_\s*\(/);
  assert.match(s,/normalize_\(value\) === 'SAMPLE'/);
  assert.match(s,/function\s+fillBlankIdentityCellsWithTba_\s*\(/);
  assert.match(s,/blankOrderIdentityCells/);
  assert.match(s,/blankSummaryIdentityCells/);
  assert.match(s,/getRangeList\(refs\)\.setValue\('TBA'\)/);
});

test('March 10 PERSONAL WW60 uses current SRP and per-pack Product Master cost',()=>{
  const s=source();
  assert.match(s,/new Date\(2026,2,10\),'PERSONAL','PERSONAL','PERSONAL',product,6,1,289,1734,123\.52,741\.12,992\.88/);
});

test('Version 47 repairs historical SAMPLE lines as PERSONAL from OLD quantities and preserves manual Summary identities',()=>{
  const s=source();
  assert.match(s,/VERSION:\s*'2026-08-18\.48'/);
  assert.match(s,/function\s+repairHistoricalPersonalData_\s*\(/);
  assert.match(s,/SpreadsheetApp\.openById\(V2\.SOURCE_ID\)/);
  assert.match(s,/normalize_\(row\.buyer\) === 'SAMPLE'/);
  assert.match(s,/const total = packs \* model\.srp/);
  assert.match(s,/const totalCost = packs \* model\.cost/);
  assert.match(s,/const netTotal = total - totalCost/);
  assert.match(s,/preserveIdentityUnlessSample_/);
  assert.match(s,/REPAIR HISTORICAL PERSONAL DATA/);
  assert.match(s,/getRange\(change\.sheetRow,1,1,9\)\.setValues/);
  assert.doesNotMatch(s,/getRange\(change\.sheetRow,1,1,12\)\.setValues/);
});

test('V2 getAllData includes current editable SUMMARY A-I values for the Portal',()=>{
  const s=source();
  assert.match(s,/function\s+getSummaryPortalData_\s*\(/);
  assert.match(s,/getLegacyAllData_\(\),summary:getSummaryPortalData_\(\)/);
});
