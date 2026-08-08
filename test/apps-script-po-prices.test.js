'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const sourcePath=path.resolve(__dirname,'..','..','MERGED-CURRENT-V2-v27.gs');

test('PO prices persist only on authoritative ORDER LINES without legacy snapshot runtime',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.doesNotMatch(source,/poPriceSnapshots:\s*'PO PRICE SNAPSHOTS'/);
  assert.doesNotMatch(source,/function\s+(?:savePoPriceSnapshot_|createPoTransaction_|savePoReview_|recordGeneratedDocuments_|getPoFile_)\s*\(/);
  assert.doesNotMatch(source,/body\.action === '(?:listPoTransactions|getPoTransaction|createPoTransaction|savePoReview|replacePoFile|recordGeneratedDocuments|getPoFile)'/);
  const helper=source.match(/function\s+appendProductsV2_\s*\([\s\S]*?\n\}/);
  assert.ok(helper,'appendProductsV2_ missing');
  assert.match(helper[0],/entry\.price/);
  assert.match(helper[0],/requestedPriceUnit === 'PACK' \? 'PACK'/);
  assert.match(helper[0],/requestedPriceUnit[\s\S]*configuredPriceUnit/);
  assert.doesNotMatch(helper[0],/prependRows_\([^\n]*V2\.SHEETS\.prices|writeSheet_\([^\n]*V2\.SHEETS\.prices|PO PRICE SNAPSHOTS/);
});

test('normal V2 order saves are idempotent, sync SUMMARY, and defer only expensive dashboards',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const helper=source.match(/function\s+appendProductsV2_\s*\([\s\S]*?\n\}/);
  assert.ok(helper,'appendProductsV2_ missing');
  assert.match(helper[0],/orderRetryKey_/);
  assert.match(helper[0],/duplicate:true/);
  assert.match(helper[0],/viewsDeferred:true/);
  assert.match(helper[0],/const existingOrderRows = readOrderRows_\(orderSheet,orderLayout\)/);
  assert.match(helper[0],/syncSummaryForOrderBatch_\(ss,[^;]+\)/);
  assert.match(helper[0],/summarySynced:true/);
  assert.match(helper[0],/prependRowsBelowHeader_\(orderSheet,newRows,orderLayout\.headerRow\)/);
  assert.match(helper[0],/sortDataRowsByDateDesc_\(orderSheet,orderLayout\.headerRow\)/);
  assert.doesNotMatch(helper[0],/\bprependRows_\(orderSheet/);
  assert.doesNotMatch(helper[0],/refreshLatestFirstViews_/);
  assert.doesNotMatch(helper[0],/buildWarehouseTrackerV2_/);
});

test('SUMMARY synchronization is targeted, idempotent, formatting-preserving, and document-column safe',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const sync=source.match(/function\s+syncSummaryForOrderBatch_\s*\([\s\S]*?\n\}/);
  assert.ok(sync,'syncSummaryForOrderBatch_ missing');
  assert.match(sync[0],/canonicalPersonalBuyer_/);
  assert.match(sync[0],/findPersonalSourceLayout_\(sheet/);
  assert.match(sync[0],/getRange\([^\n]*,1,1,9\)\.setValues/);
  assert.match(sync[0],/prependSummaryRowsPreservingFormat_/);
  assert.doesNotMatch(sync[0],/\.clear\(|clearContent|deleteRow|sort\(|setBackground|setFontColor|writeSheet_|formatV2_/);
  const prepend=source.match(/function\s+prependSummaryRowsPreservingFormat_\s*\([\s\S]*?\n\}/);
  assert.ok(prepend,'prependSummaryRowsPreservingFormat_ missing');
  assert.match(prepend[0],/insertRowsBefore/);
  assert.match(prepend[0],/copyFormatToRange/);
  assert.match(prepend[0],/getLastColumn/);
  assert.match(prepend[0],/getRange\([^\n]*,1,[^\n]*,9\)\.setValues/);
  assert.doesNotMatch(prepend[0],/breakApart|setBackground|setFontColor|clearContent|delete/);
  assert.match(source,/body\.action === 'repairRecentSummaryRows'/);
});

test('Vercel bridge allows the legacy V2 backend longer than twenty seconds',()=>{
  const bridge=fs.readFileSync(path.resolve(__dirname,'..','api','sheets.js'),'utf8');
  assert.match(bridge,/forwardToAppsScript\(V2_APPS_SCRIPT_URL, V2_API_TOKEN, action, payload, "V2", 45000\)/);
  assert.match(bridge,/if \(v2Result\.duplicate === true\)[\s\S]*Original was not called/);
});

test('Product Master COST resolves as per-pack cost and never falls back to COST PER CASE',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const names=['normalizeProductHeader_','resolveProductUnitCostIndex_'];
  const helpers=names.map(name=>{
    const match=source.match(new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`));
    assert.ok(match,`${name} missing`);
    return match[0];
  }).join('\n');
  const context={};
  vm.runInNewContext(`${helpers}; result=resolveProductUnitCostIndex_(['PRODUCT MASTER SKU','BRAND','PRODUCT NAME','PACKS PER CASE','SRP','COST','COST PER CASE']);`,context);
  assert.equal(context.result,5);
  vm.runInNewContext(`${helpers}; result=resolveProductUnitCostIndex_(['SKU','PRODUCT','COST\u200B','COST PER CASE']);`,context);
  assert.equal(context.result,2);
  assert.throws(()=>vm.runInNewContext(`${helpers}; resolveProductUnitCostIndex_(['SKU','PRODUCT NAME','PACKS PER CASE','COST PER CASE']);`),/per-pack COST column/i);
});

test('Product Master supports a title row and reads data below the detected header',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const names=['normalize_','headerIndex_','normalizeProductHeader_','resolveProductUnitCostIndex_','productColumnMap_','readProductRows_'];
  const helpers=names.map(name=>{
    const match=source.match(new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`));
    assert.ok(match,`${name} missing`);
    return match[0];
  }).join('\n');
  const rows=[
    ['PRODUCT MASTER','','','','','',''],
    ['PRODUCT MASTER SKU','BRAND','PRODUCT NAME','PACKS PER CASE','SRP','COST','COST PER CASE'],
    ['FLU-84CC3E87','Fluffy','Cotton Pads Fluffy',72,179,39.94,2875.68]
  ];
  const sheet={
    getLastColumn:()=>7,getLastRow:()=>3,
    getRange:(row,column,rowCount,width)=>({
      getDisplayValues:()=>rows.slice(row-1,row-1+rowCount).map(r=>r.slice(column-1,column-1+width)),
      getValues:()=>rows.slice(row-1,row-1+rowCount).map(r=>r.slice(column-1,column-1+width))
    })
  };
  const context={sheet};
  vm.runInNewContext(`${helpers}; columns=productColumnMap_(sheet); products=readProductRows_(sheet,columns);`,context);
  assert.equal(context.columns.headerRow,2);
  assert.equal(context.columns.cost,5);
  assert.equal(context.columns.srp,4);
  assert.equal(context.products.length,1);
  assert.equal(context.products[0][5],39.94);
  assert.doesNotMatch(source,/readBody_\(productSheet\)/);
});

test('Summary document index detects an ORDER LINES title row before canonical headers',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const names=['normalize_','headerIndex_','documentIdentityColumns_','findDocumentIdentityHeaderRowInValues_'];
  const helpers=names.map(name=>{
    const match=source.match(new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`));
    assert.ok(match,`${name} missing`);
    return match[0];
  }).join('\n');
  const context={};
  vm.runInNewContext(`${helpers}; layout=findDocumentIdentityHeaderRowInValues_([['ORDER LINES'],['DATE','ORDER BY','PO #','SI #','PRODUCT NAME'],['2026-07-30','WATSONS','9691669','','Cotton Pads']], 'ORDER LINES');`,context);
  assert.equal(context.layout.headerRow,2);
  assert.equal(context.layout.columns.date,0);
  assert.equal(context.layout.columns.buyer,1);
  assert.equal(context.layout.columns.po,2);
  assert.equal(context.layout.columns.si,3);
});

test('PO bootstrap is cached and gets an action-specific timeout allowance',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const client=fs.readFileSync(path.resolve(__dirname,'..','lib','apps-script-client.js'),'utf8');
  assert.match(source,/function getPoBootstrap_\(\)[\s\S]*CacheService\.getScriptCache/);
  assert.match(client,/action === ['"]getPoBootstrap['"][\s\S]*45000/);
});

test('post-migration bridge retains only the idempotent Summary-column action',()=>{
  const bridge=fs.readFileSync(path.resolve(__dirname,'..','api','sheets.js'),'utf8');
  assert.match(bridge,/ensureSummaryDocumentColumns/);
  assert.doesNotMatch(bridge,/retireLegacyPoTechnicalSheets/);
});

test('Portal blocks order writes unless the V2 backend is in the explicit document-safe version set',()=>{
  const bridge=fs.readFileSync(path.resolve(__dirname,'..','api','sheets.js'),'utf8');
  assert.match(bridge,/ORDER_SAFE_V2_VERSIONS\s*=\s*new Set\(\["2026-07-30\.35", "2026-08-01\.36", "2026-08-01\.37", "2026-08-01\.38", "2026-08-01\.39", "2026-08-01\.40", "2026-08-01\.41", "2026-08-08\.42"\]\)/);
  assert.match(bridge,/if \(!ORDER_SAFE_V2_VERSIONS\.has\(health\.version\)\)[\s\S]*blocked/i);
});

test('PERSONAL pricing is backend-authoritative from Product Master SRP and historical repair is narrowly scoped',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const resolver=source.match(/function\s+resolveEntrySellingPrice_\s*\([\s\S]*?\n\}/);
  assert.ok(resolver,'resolveEntrySellingPrice_ missing');
  const context={
    canonicalPersonalBuyer_:value=>String(value||'').trim().toUpperCase()==='PERSONAL'?'PERSONAL':String(value||'').trim(),
    number_:value=>Number(value)||0
  };
  vm.runInNewContext(`${resolver[0]}; personal=resolveEntrySellingPrice_('PERSONAL',0,[null,null,null,null,179,39.94],{srp:4}); regular=resolveEntrySellingPrice_('WATSONS',128.88,[null,null,null,null,179,39.94],{srp:4});`,context);
  assert.equal(context.personal,179);
  assert.equal(context.regular,128.88);
  assert.throws(()=>vm.runInNewContext(`${resolver[0]}; resolveEntrySellingPrice_('PERSONAL',0,[null,null,null,null,0],{srp:4});`,context),/SRP/i);
  const append=source.match(/function\s+appendProductsV2_\s*\([\s\S]*?\n\}/);
  assert.ok(append,'appendProductsV2_ missing');
  assert.match(append[0],/resolveEntrySellingPrice_\(buyer,entry\.price,model,productColumns\)/);
  assert.match(append[0],/priceUnit = canonicalPersonalBuyer_\(buyer\) === 'PERSONAL' \? 'PACK'/);
  assert.match(append[0],/canonicalEntries/);
  const repair=source.match(/function\s+repairPersonalSrpPricing_\s*\([\s\S]*?\n\}/);
  assert.ok(repair,'repairPersonalSrpPricing_ missing');
  assert.match(repair[0],/canonicalPersonalBuyer_/);
  assert.match(repair[0],/getRange\([^\n]*,8,[^\n]*,5\)\.setValues/);
  assert.doesNotMatch(repair[0],/writeSheet_|clearContent|deleteRow|sort\(|setBackground|setFontColor/);
  assert.match(source,/body\.action === 'repairPersonalSrpPricing'/);
});

test('PERSONAL summary view excludes document identity columns and canonicalizes historical SAMPLE rows',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.match(source,/VERSION:\s*'2026-08-08\.42'/);
  assert.match(source,/personal:\s*'PERSONAL'/);
  assert.match(source,/const PERSONAL_HEADERS\s*=\s*Object\.freeze\(\['DATE','ORDER BY','ITEMS','TOTAL','COST','NET TOTAL','DUE BY'\]\)/);
  assert.match(source,/function\s+PERSONAL_SUMMARY\s*\(/);
  assert.match(source,/function\s+setupPersonalTab_\s*\(/);
  assert.match(source,/body\.action === 'setupPersonalTab'/);
  assert.match(source,/canonicalPersonalBuyer_\(entry\.buyer\)/);
  const setup=source.match(/function\s+setupPersonalTab_\s*\([\s\S]*?\n\}/);
  assert.ok(setup,'setupPersonalTab_ missing');
  assert.match(setup[0],/V2\.SHEETS\.orders/);
  assert.match(setup[0],/ensurePersonalSheet_/);
  assert.match(setup[0],/identityHeaders\s*=\s*\['ORDER BY','PO #','SI #'\]/);
  assert.match(setup[0],/getRangeList\(renamedCells\)\.setValue\('PERSONAL'\)/);
  assert.match(setup[0],/renamedSampleCells:renamedCells\.length/);
  assert.doesNotMatch(setup[0],/clear\([^)]*V2\.SHEETS\.summary|writeSheet_\([^\n]*V2\.SHEETS\.summary|deleteSheet/);

  const names=['canonicalPersonalBuyer_','buildSummaryRows_','buildPersonalSummaryRows_'];
  const helpers=names.map(name=>{
    const match=source.match(new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`));
    assert.ok(match,`${name} missing`);
    return match[0];
  }).join('\n');
  const rows=[
    [new Date('2026-07-01'),'SAMPLE','','','Cotton Pads Fluffy',2,1,0,0,39.94,79.88,-79.88],
    [new Date('2026-07-01'),'PERSONAL','','','Kitchen Towel Fluffy',1,1,0,0,59.88,59.88,-59.88],
    [new Date('2026-07-01'),'WATSONS GANADO','1','2','Paper Towel Fluffy',20,1,128.88,2577.6,65.89,1317.8,1259.8]
  ];
  const context={
    rows,
    normalize_:value=>String(value||'').trim().toUpperCase().replace(/\s+/g,' '),
    dateKey_:value=>new Date(value).toISOString().slice(0,10),
    number_:value=>Number(value)||0,
    buyerTermsMonths_:()=>0,
    addCalendarMonths_:()=>'',
    summaryItemCode_:value=>({
      'Cotton Pads Fluffy':'CP',
      'Kitchen Towel Fluffy':'KT',
      'Paper Towel Fluffy':'PT'
    }[value]||value)
  };
  vm.runInNewContext(`${helpers}; result=buildPersonalSummaryRows_(rows);`,context);
  assert.equal(context.result.length,1);
  assert.equal(context.result[0].length,7);
  assert.equal(context.result[0][1],'PERSONAL');
  assert.equal(context.result[0][2],'CP, KT');
  assert.equal(context.result[0][3],0);
  assert.equal(context.result[0][4],139.76);
  assert.equal(context.result[0][5],-139.76);
  assert.equal(context.result[0][6],'N/A');
});

test('PERSONAL uses an insertion-proof live ORDER LINES range without rebuilding user formatting',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const refresh=source.match(/function\s+refreshPersonalSheetPreservingFormat_\s*\([\s\S]*?\n\}/);
  assert.ok(refresh,'refreshPersonalSheetPreservingFormat_ missing');
  assert.match(refresh[0],/PERSONAL_SUMMARY\('\$\{V2\.SHEETS\.orders\}'!A:L\)/);
  assert.doesNotMatch(refresh[0],/breakApart|setBackground|setFontColor|copyTo|merge\(/);
  const ensure=source.match(/function\s+ensurePersonalSheet_\s*\([\s\S]*?\n\}/);
  assert.ok(ensure,'ensurePersonalSheet_ missing');
  assert.match(ensure[0],/if \(sheet\) return refreshPersonalSheetPreservingFormat_\(target\)/);
  const append=source.match(/function\s+appendProductsV2_\s*\([\s\S]*?\n\}/);
  assert.ok(append,'appendProductsV2_ missing');
  assert.match(append[0],/personalLive:true/);
  assert.doesNotMatch(append[0],/buildProductView_|buildBuyerView_|ensurePersonalSheet_/);
});

test('read-only startup calls have a cold-start-safe timeout budget',()=>{
  const bridge=fs.readFileSync(path.resolve(__dirname,'..','api','sheets.js'),'utf8');
  const vercel=fs.readFileSync(path.resolve(__dirname,'..','vercel.json'),'utf8');
  assert.match(bridge,/action === "getV2Bootstrap"[\s\S]*"V2",\s*55000/);
  assert.match(bridge,/action === "getAllData"[\s\S]*"V2",\s*55000/);
  assert.match(bridge,/\["setupPersonalTab", "setupViews"\]\.includes\(action\)[\s\S]*"V2",\s*55000/);
  assert.equal(JSON.parse(vercel).functions['api/sheets.js'].maxDuration,60);
});

test('V2 bootstrap reads Buyer Prices below its detected title/header and does not retain historical-only buyers',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const helper=source.match(/function\s+getV2Bootstrap_\s*\([\s\S]*?\n\}/);
  assert.ok(helper,'getV2Bootstrap_ missing');
  assert.match(helper[0],/findPersonalSourceLayout_\(priceSheet,PRICE_HEADERS\)/);
  assert.doesNotMatch(helper[0],/readBody_\(ss\.getSheetByName\(V2\.SHEETS\.prices\)\)/);
  assert.doesNotMatch(helper[0],/orderBuyers/);
});
