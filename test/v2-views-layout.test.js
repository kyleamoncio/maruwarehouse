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
  assert.match(source,/VERSION:\s*'2026-08-08\.42'/);
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
  assert.match(builder,/starts with 'WATSONS'/);
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
