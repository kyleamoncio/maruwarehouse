'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const sourcePath=path.resolve(__dirname,'..','..','MERGED-CURRENT-V2-v27.gs');

function extractFunction(source,name){
  const match=source.match(new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`));
  assert.ok(match,`${name} missing`);
  return match[0];
}

test('V2 view layout keeps ORDER LINES at two frozen rows and PERSONAL beside SUMMARY',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.match(source,/VERSION:\s*'2026-08-18\.47'/);
  assert.match(source,/buyerView:\s*'BUYER VIEW'/);
  assert.match(source,/orders\.setFrozenRows\(2\)/);
  assert.match(source,/moveSheetAfter_\(target,\s*personalSheet,\s*summarySheet\)/);
  assert.match(source,/moveSheetAfter_\(target,\s*buyerView,\s*productView\)/);
  assert.doesNotMatch(extractFunction(source,'ensurePersonalSheet_'),/moveActiveSheet\(target\.getNumSheets\(\)\)/);
});

test('BUYER VIEW dropdown dynamically includes BUYER PRICES plus PERSONAL',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const helper=extractFunction(source,'buyerNamesFromPriceValues_');
  const context={values:[['BUYER'],['WATSONS'],['SM HYPERMARKET'],['watsons'],[''],['PENLINE STATIONERY INC.']]};
  vm.runInNewContext(`${helper}; result=buyerNamesFromPriceValues_(values);`,context);
  assert.equal(JSON.stringify(context.result),JSON.stringify(['WATSONS','SM HYPERMARKET','PENLINE STATIONERY INC.']));
  const builder=extractFunction(source,'buildBuyerView_');
  assert.match(builder,/V2\.SHEETS\.prices/);
  const dropdown=extractFunction(source,'buyerDropdownRange_');
  assert.match(dropdown,/V2\.SHEETS\.prices/);
  assert.match(dropdown,/PERSONAL/);
  assert.match(dropdown,/UNIQUE/);
  assert.match(builder,/buyerDropdownRange_\(target,priceSheet,priceLayout\)/);
  assert.match(builder,/buyerValues\.concat\(\[\['PERSONAL'\]\]\)/);
  assert.match(builder,/requireValueInRange\(buyerSourceRange,true\)/);
  assert.match(builder,/V2\.SHEETS\.orders/);
  const query=extractFunction(source,'buyerViewActivityFormula_');
  assert.match(query,/starts with 'WATSONS'/);
});

test('Product and Buyer selectors use large merged selector cells while preserving separate helper columns',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const product=extractFunction(source,'buildProductView_');
  const buyer=extractFunction(source,'buildBuyerView_');
  const style=extractFunction(source,'styleViewSelector_');
  assert.match(product,/getRange\('B2:J2'\)\.merge\(\)/);
  assert.match(style,/setRowHeight\(2,34\)/);
  assert.match(product,/helper\.getRange\(1,1,helper\.getMaxRows\(\),1\)\.clearContent/);
  assert.doesNotMatch(product,/helper\.clear\(\)/);
  assert.match(buyer,/getRange\('B2:L2'\)\.merge\(\)/);
});

test('Product refresh repairs a legacy B1:J1 dropdown into merged B2:J2 without touching detail rows',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const repair=extractFunction(source,'ensureProductSelectorLayout_');
  const refresh=extractFunction(source,'refreshProductViewPreservingFormat_');
  assert.match(repair,/getRange\('B1:J1'\)/);
  assert.match(repair,/getRange\('B2:J2'\)/);
  assert.match(repair,/misplaced/);
  assert.match(repair,/breakApart\(\)/);
  assert.match(repair,/getRange\('B2:J2'\)\.merge\(\)/);
  assert.doesNotMatch(repair,/A3|A8|A9|A11|clear\(/);
  assert.match(refresh,/ensureProductSelectorLayout_\(sheet\)/);
});

test('setupViews action builds both views without writing SUMMARY values',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const setup=extractFunction(source,'setupViewsV2_');
  assert.match(source,/body\.action === 'setupViews'/);
  assert.match(setup,/buildProductView_|refreshProductViewPreservingFormat_/);
  assert.match(setup,/buildBuyerView_|refreshBuyerViewPreservingFormat_/);
  assert.match(setup,/setFrozenRows\(2\)/);
  assert.doesNotMatch(setup,/setValues\([^\n]*summary|clear\([^\n]*summary|writeSheet_\([^\n]*summary/i);
});

test('Product totals move to top metrics without unmerging or recoloring user formatting',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const move=extractFunction(source,'rearrangeProductViewTotals_');
  const detector=extractFunction(source,'findProductViewHeaderRow_');
  assert.match(detector,/\['ORDER BY','PO #','SI #'\]/);
  assert.match(detector,/headers\[1\].*headers\[2\].*headers\[3\]/);
  assert.match(move,/findProductViewHeaderRow_\(sheet\)/);
  assert.match(move,/insertRowsAfter\(8,3\)/);
  assert.match(move,/getRange\('A9:A11'\)\.setValues\(\[\['Total'\],\['Total Cost'\],\['Net Total'\]\]\)/);
  assert.match(move,/getRange\('B9'\)\.setFormula/);
  assert.match(move,/getRange\('B10'\)\.setFormula/);
  assert.match(move,/getRange\('B11'\)\.setFormula/);
  assert.match(move,/getRange\('H12:J12'\)\.clearContent\(\)/);
  assert.match(move,/\['B9:J9','B10:J10','B11:J11'\]/);
  assert.doesNotMatch(move,/breakApart|setBackground|setFontColor/);
});

test('preserving view refreshes never unmerge or recolor and requested values stay centered',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const product=extractFunction(source,'refreshProductViewPreservingFormat_');
  const buyer=extractFunction(source,'refreshBuyerViewPreservingFormat_');
  for(const helper of [product,buyer]) assert.doesNotMatch(helper,/breakApart|setBackground|setFontColor|merge\(/);
  assert.match(product,/centerViewValueColumns_\(sheet,headerRow,\['DATE','PO #','SI #','PACK QTY','CASE QTY','PRICE','TOTAL','TOTAL COST','NET TOTAL'\]\)/);
  assert.match(buyer,/centerViewValueColumns_\(sheet,headerRow,\['DATE','PO #','SI #','ORDER PACK QTY','ORDER CASE QTY','PRICE','TOTAL','UNIT COST','TOTAL COST','NET TOTAL'\]\)/);
  assert.match(source,/function\s+centerViewValueColumns_\s*\(/);
});

test('Product View deducts recorded pack and case quantities independently',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.doesNotMatch(source,/getRange\('B8'\)\.setFormula\(`=IFERROR\(B7\/B5/);
  assert.equal((source.match(/'\$\{V2\.SHEETS\.snapshots\}'!G:G/g)||[]).length,2);
  assert.match(source,/SUMIF\('\$\{V2\.SHEETS\.orders\}'!E:E,B2,'\$\{V2\.SHEETS\.orders\}'!G:G\)/);
  assert.match(source,/SUMIF\('\$\{V2\.SHEETS\.restocks\}'!B:B,B2,'\$\{V2\.SHEETS\.restocks\}'!C:C\)/);
});

test('Warehouse Tracker uses Product View balances once per product and neutralizes duplicate listings',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const helper=extractFunction(source,'legacyTrackerDuplicateReversal_');
  const context={};
  vm.runInNewContext(`${helper}; result=[
    legacyTrackerDuplicateReversal_('QC INVENTORY 2026','PLUSH BATHROOM TISSUE 12 ROLLS'),
    legacyTrackerDuplicateReversal_('PASIG INVENTORY 2026','PLUSH BATHROOM TISSUE 20 ROLLS'),
    legacyTrackerDuplicateReversal_('FAST CARGO INVENTORY 2026','PLUSH WET WIPES 30s'),
    legacyTrackerDuplicateReversal_('QC INVENTORY 2026','FLUFFY BATHROOM TISSUE 12 ROLLS')
  ];`,context);
  assert.equal(JSON.stringify(context.result),JSON.stringify([
    {packs:1408,product:'Bathroom Tissue 12s Plush'},
    {packs:2310,product:'Bathroom Tissue 20s Plush'},
    {packs:36,product:'Wet Wipes 30s Plush'},
    null
  ]));
  assert.match(source,/const authoritativeTrackerBalances = new Map\(inventoryBalancesForProducts_/);
  assert.match(source,/const trackerBalanceProducts = trackerProductRows\.map/);
  assert.match(source,/const correctedPacks = number_\(balance\.currentPacks\)/);
  assert.match(source,/row\[1\] = number_\(balance\.currentCases\)/);
  assert.match(source,/openingCases:0,soldCases:0,restockedCases:0,currentCases:0/);
  assert.match(source,/if \(seenTrackerProducts\.has\(productKey\)\)/);
  assert.match(source,/row\[1\] = 'N\/A';[\s\S]*row\[2\] = 'N\/A';[\s\S]*row\[3\] = 'N\/A'/);
  assert.match(source,/reconciledProducts\.push/);
  assert.match(source,/duplicateListings\.push/);
  const productKey=extractFunction(source,'trackerProductKey_');
  const keyContext={normalize_:value=>String(value||'').trim().toUpperCase().replace(/\s+/g,' ')};
  vm.runInNewContext(`${productKey}; result=trackerProductKey_;`,keyContext);
  assert.equal(keyContext.result('FLUFFY KITCHEN TOWEL'),keyContext.result('Kitchen Towel Fluffy'));
  assert.notEqual(keyContext.result('FLUFFY KITCHEN TOWEL'),keyContext.result('Kitchen Towel Plush'));
  assert.match(source,/repairPlushInventoryDuplicates_/);
  assert.match(source,/body\.action === 'buildWarehouseTrackerV2' && body\.repairPlushInventoryDuplicates === true/);
  assert.match(source,/REPAIR PLUSH INVENTORY DUPLICATES/);
});
