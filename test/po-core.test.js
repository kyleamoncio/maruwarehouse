'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function extractPdfText(filename) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', filename)));
  const document = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join('\n'));
  }
  return pages.join('\n\f\n');
}

test('Watsons parser extracts supplied historical PO header and all four lines', async () => {
  const { parsePurchaseOrder } = require('../lib/po-core');
  const text = await extractPdfText('watsons-9691669.pdf');
  const result = parsePurchaseOrder(text, { sourceFilename: 'mail-1116551101_0_PO96916695477609.pdf' });
  assert.equal(result.profile, 'WATSONS');
  assert.equal(result.poNumber, '9691669');
  assert.equal(result.customerCode, 'WATSONS');
  assert.match(result.branch, /PAMPANGA/i);
  assert.equal(result.paymentTerms, '60 Days');
  assert.equal(result.lines.length, 4);
  assert.deepEqual(result.lines.map(line => line.customerArticleNumber), ['50033566','50033576','50033577','50033580']);
  assert.deepEqual(result.lines.map(line => line.poQuantity), [2,5,1,2]);
  assert.deepEqual(result.lines.map(line => line.unitPrice), [179,69,150,179]);
  assert.equal(result.poTotal, 103182.43);
});

test('SM six-page allocation PO is deduplicated into four master product lines', async () => {
  const { parsePurchaseOrder, validateExtractedPo } = require('../lib/po-core');
  const text = await extractPdfText('sm-1114753858.pdf');
  const result = parsePurchaseOrder(text, { sourceFilename: '7.18.pdf' });
  assert.equal(result.profile, 'SM');
  assert.equal(result.poNumber, '1114753858');
  assert.equal(result.poDate, '2026-07-17');
  assert.equal(result.requiredDeliveryDate, '2026-07-23');
  assert.equal(result.paymentTerms, '30 Days Due Net');
  assert.equal(result.poTotal, 871302.77);
  assert.deepEqual(result.lines.map(line => line.customerArticleNumber), ['20568544','20568545','20594466','20594468']);
  assert.deepEqual(result.lines.map(line => line.poQuantity), [1,3,48,57]);
  assert.deepEqual(result.lines.map(line => line.unitPrice), [694.11,835.71,7125.51,9229.42]);
  assert.deepEqual(result.lines.map(line => line.lineAmount), [694.11,2507.13,342024.48,526076.94]);
  assert.equal(validateExtractedPo(result).success, true);
});

test('canonical SM mappings auto-select all four real PO products and conversions',async()=>{
  const {parsePurchaseOrder,applyMappingsAndCalculate}=require('../lib/po-core');
  const {SM_DEFAULT_MAPPINGS}=require('../lib/po-default-mappings');
  const integration=require('../public/po-entry-integration');
  const po=parsePurchaseOrder(await extractPdfText('sm-1114753858.pdf'),{sourceFilename:'7.18.pdf'});
  const calculated=applyMappingsAndCalculate(po,SM_DEFAULT_MAPPINGS);
  const draft=integration.buildEntryDraft(calculated,{documentDate:'2026-07-23'});
  assert.deepEqual(calculated.lines.map(line=>line.matched),[true,true,true,true]);
  assert.deepEqual(draft.lines.map(line=>line.product),['Bathroom Tissue 12s Fluffy','Bathroom Tissue 4s Fluffy','Cotton Pads Fluffy','Cotton Buds Fluffy']);
  assert.deepEqual(draft.lines.map(line=>line.packs),[4,36,6912,13680]);
  assert.deepEqual(draft.lines.map(line=>line.cases),[1,3,96,57]);
  assert.equal(calculated.totals.poMatches,true);
  assert.equal(calculated.totals.gross,871302.66);
  assert.equal(calculated.totals.poDifference,-0.11);
});

test('real SM PO allocates its eleven-cent header rounding while preserving manual CASE pricing',async()=>{
  const serverCore=require('../lib/po-core');
  const browserCore=require('../public/po-core');
  const {SM_DEFAULT_MAPPINGS}=require('../lib/po-default-mappings');
  const integration=require('../public/po-entry-integration');
  const po=serverCore.parsePurchaseOrder(await extractPdfText('sm-1114753858.pdf'),{sourceFilename:'7.18.pdf'});
  const serverCalculated=serverCore.applyMappingsAndCalculate(po,SM_DEFAULT_MAPPINGS);
  const browserCalculated=browserCore.applyMappingsAndCalculate(po,SM_DEFAULT_MAPPINGS);
  assert.equal(serverCalculated.totals.poMatches,true);
  assert.equal(browserCalculated.totals.poMatches,true);
  const draft=integration.buildEntryDraft(serverCalculated,{documentDate:'2026-07-23'});
  const amounts=draft.lines.map(line=>integration.entryLineAmount({packs:line.packs,cases:line.cases,price:line.price,priceUnit:'CASE',poWorkflow:true}));
  assert.deepEqual(amounts,[694.11,2507.13,342024.48,526077.05]);
  assert.equal(Math.round(amounts.reduce((sum,amount)=>sum+amount,0)*100)/100,871302.77);
  assert.equal(draft.lines.at(-1).roundingAdjustment,0.11);
  assert.equal(integration.entryLineAmount({packs:240,cases:1,price:38.45,priceUnit:'CASE',poWorkflow:false}),38.45);
});

test('active Sheet mappings override canonical SM fallbacks by customer and article',()=>{
  const {mergeDefaultMappings}=require('../lib/po-default-mappings');
  const custom={id:'SHEET-SM-20568544',customerCode:'SM',customerArticleNumber:'20568544',internalProductName:'Custom Product',packsPerPoCase:8,packsPerPhysicalCarton:4,active:true};
  const merged=mergeDefaultMappings([custom]);
  assert.equal(merged.find(mapping=>mapping.customerArticleNumber==='20568544'),custom);
  assert.equal(merged.filter(mapping=>mapping.customerCode==='SM').length,4);
});

test('Watsons Plush 12-roll article auto-maps to 8 packs at the exact PO-derived price',()=>{
  const {applyMappingsAndCalculate}=require('../lib/po-core');
  const {WATSONS_DEFAULT_MAPPINGS}=require('../lib/po-default-mappings');
  const integration=require('../public/po-entry-integration');
  const po={customerCode:'WATSONS',poNumber:'9714393',poTotal:2251.65,vatTreatment:'VAT_INCLUSIVE',lines:[{
    customerArticleNumber:'50057440',customerDescription:'PLUSH FLSHBLE TISSUE 3PLY12ROLLS W CB',poQuantity:1,poUnit:'CASE',unitPrice:2251.65,lineAmount:2251.65
  }]};
  const calculated=applyMappingsAndCalculate(po,WATSONS_DEFAULT_MAPPINGS);
  const draft=integration.buildEntryDraft(calculated,{documentDate:'2026-07-27'});
  assert.equal(calculated.lines[0].matched,true);
  assert.equal(calculated.lines[0].internalProductName,'Bathroom Tissue 12s Plush');
  assert.equal(calculated.lines[0].sellingQuantity,8);
  assert.equal(calculated.lines[0].physicalCartons,1);
  assert.equal(draft.lines[0].price,281.45625);
  assert.equal(integration.entryLineAmount({packs:draft.lines[0].packs,price:draft.lines[0].price,poWorkflow:true}),2251.65);
  assert.equal(calculated.totals.poMatches,true);
});

test('mapping and conversion keep PO cases separate from physical cartons', () => {
  const { applyMappingsAndCalculate } = require('../lib/po-core');
  const po = {
    customerCode:'WATSONS', poNumber:'9691669', currency:'PHP', vatTreatment:'VAT_INCLUSIVE',
    lines:[{customerArticleNumber:'50033566',customerDescription:'FLUFFY SQUARE COTTON PADS 100S',poQuantity:2,poUnit:'CASE',unitPrice:179,lineAmount:37117.44}]
  };
  const mappings = [{
    customerCode:'WATSONS',customerArticleNumber:'50033566',internalSku:'F-CP100',internalProductName:'Cotton Pads Fluffy',
    invoiceDescription:'FLUFFY SQUARE COTTON PADS 100S',drDescription:'FLUFFY SQUARE COTTON PADS 100S',
    poUnit:'CASE',sellingUnit:'PACK',packsPerPoCase:144,packsPerPhysicalCarton:72,sellingPrice:128.88,vatTreatment:'VAT_INCLUSIVE',active:true
  }];
  const result = applyMappingsAndCalculate(po, mappings);
  assert.equal(result.lines[0].sellingQuantity, 288);
  assert.equal(result.lines[0].physicalCartons, 4);
  assert.equal(result.lines[0].calculatedAmount, 37117.44);
  assert.equal(result.totals.gross, 37117.44);
  assert.equal(result.totals.vat, 3976.87);
  assert.equal(result.totals.netOfVat, 33140.57);
});

test('PO price snapshot uses the uploaded PO amount and never the Warehouse buyer price', () => {
  const { applyMappingsAndCalculate } = require('../lib/po-core');
  const po = {
    customerCode:'WATSONS', poNumber:'9261694', poTotal:10782.72, vatTreatment:'VAT_INCLUSIVE',
    lines:[{customerArticleNumber:'BATH12',customerDescription:'FLUFFY Bathroom tissue 12 rolls',poQuantity:1,poUnit:'CASE',unitPrice:312,lineAmount:10782.72}]
  };
  const mappings=[{customerCode:'WATSONS',customerArticleNumber:'BATH12',internalSku:'F-BT12',internalProductName:'Fluffy Bathroom Tissue 12 Rolls',invoiceDescription:'FLUFFY Bathroom tissue 12 rolls',poUnit:'CASE',sellingUnit:'PACK',packsPerPoCase:48,packsPerPhysicalCarton:4,sellingPrice:999,vatTreatment:'VAT_INCLUSIVE',active:true}];
  const result=applyMappingsAndCalculate(po,mappings);
  assert.equal(result.lines[0].poDisplayUnitPrice,312);
  assert.equal(result.lines[0].effectivePackPrice,224.64);
  assert.equal(result.lines[0].calculatedAmount,10782.72);
  assert.equal(result.lines[0].priceSource,'PURCHASE_ORDER');
  assert.equal(result.lines[0].physicalCartons,12);
  assert.equal(result.totals.gross,10782.72);
  assert.equal(result.totals.poMatches,true);
});

test('cotton pads convert one PO case into two physical cartons', () => {
  const { applyMappingsAndCalculate } = require('../lib/po-core');
  const result=applyMappingsAndCalculate({customerCode:'WATSONS',poNumber:'PAD-1',poTotal:18558.72,vatTreatment:'VAT_INCLUSIVE',lines:[{customerArticleNumber:'50033566',poQuantity:1,poUnit:'CASE',unitPrice:179,lineAmount:18558.72}]},[{customerCode:'WATSONS',customerArticleNumber:'50033566',internalProductName:'Cotton Pads Fluffy',packsPerPoCase:144,packsPerPhysicalCarton:72,active:true}]);
  assert.equal(result.lines[0].sellingQuantity,144);
  assert.equal(result.lines[0].physicalCartons,2);
});

test('calculations use decimal-safe deterministic rounding and flag PO mismatch', () => {
  const { calculateTotals } = require('../lib/po-core');
  const totals = calculateTotals([
    { calculatedAmount: 59616, vatTreatment:'VAT_INCLUSIVE' },
    { calculatedAmount: 1296, vatTreatment:'VAT_INCLUSIVE' }
  ], 60909.79);
  assert.equal(totals.gross, 60912);
  assert.equal(totals.vat, 6526.29);
  assert.equal(totals.netOfVat, 54385.71);
  assert.equal(totals.poDifference, 2.21);
  assert.equal(totals.poMatches, false);
});

test('missing official PO line amount blocks generation instead of using Warehouse prices', () => {
  const { validateForGeneration, applyMappingsAndCalculate }=require('../lib/po-core');
  const calculated=applyMappingsAndCalculate({customerCode:'WATSONS',poNumber:'PO-1',vatTreatment:'VAT_INCLUSIVE',lines:[{customerArticleNumber:'A',poQuantity:1,poUnit:'CASE',unitPrice:100,lineAmount:0}]},[{customerCode:'WATSONS',customerArticleNumber:'A',internalProductName:'Product A',packsPerPoCase:10,packsPerPhysicalCarton:5,sellingPrice:999,active:true}]);
  const validation=validateForGeneration(calculated);
  assert.equal(validation.canGenerate,false);
  assert.ok(validation.errors.some(error=>error.code==='MISSING_PO_LINE_AMOUNT'));
});

test('unmatched products and missing required fields block generation', () => {
  const { validateForGeneration, applyMappingsAndCalculate } = require('../lib/po-core');
  const calculated = applyMappingsAndCalculate({customerCode:'WATSONS',poNumber:'',lines:[{customerArticleNumber:'UNKNOWN',poQuantity:1,poUnit:'CASE'}]}, []);
  const validation = validateForGeneration(calculated);
  assert.equal(validation.canGenerate, false);
  assert.ok(validation.errors.some(error => error.code === 'MISSING_PO_NUMBER'));
  assert.ok(validation.errors.some(error => error.code === 'UNMATCHED_PRODUCT'));
});

test('a reviewer-selected mapping overrides the extracted article match', () => {
  const { applyMappingsAndCalculate }=require('../lib/po-core');
  const mappings=[
    {id:'ORIGINAL',customerCode:'WATSONS',customerArticleNumber:'A',internalProductName:'Wrong product',packsPerPoCase:10,packsPerPhysicalCarton:5,active:true},
    {id:'REVIEWED',customerCode:'WATSONS',customerArticleNumber:'B',internalProductName:'Correct product',packsPerPoCase:24,packsPerPhysicalCarton:12,active:true}
  ];
  const calculated=applyMappingsAndCalculate({customerCode:'WATSONS',poTotal:240,vatTreatment:'VAT_INCLUSIVE',lines:[{customerArticleNumber:'A',mappingId:'REVIEWED',poQuantity:1,poUnit:'CASE',unitPrice:10,lineAmount:240}]},mappings);
  assert.equal(calculated.lines[0].mappingId,'REVIEWED');
  assert.equal(calculated.lines[0].internalProductName,'Correct product');
  assert.equal(calculated.lines[0].sellingQuantity,24);
  assert.equal(calculated.lines[0].physicalCartons,2);
});

test('duplicate detection checks both normalized PO identity and SHA-256', () => {
  const { findDuplicateUpload } = require('../lib/po-core');
  const records = [
    {id:'a',customerCode:'WATSONS',poNumber:'9691669',fileHash:'abc'},
    {id:'b',customerCode:'SM',poNumber:'111',fileHash:'def'}
  ];
  assert.equal(findDuplicateUpload(records,{customerCode:'watsons',poNumber:'9691669',fileHash:'zzz'}).reason,'PO_NUMBER');
  assert.equal(findDuplicateUpload(records,{customerCode:'WATSONS',poNumber:'new',fileHash:'abc'}).reason,'FILE_HASH');
  assert.equal(findDuplicateUpload(records,{customerCode:'WATSONS',poNumber:'new',fileHash:'new'}),null);
});

test('calibration applies millimeter offsets and percentage scale deterministically', () => {
  const { applyCalibration, mmToPoints } = require('../lib/po-core');
  const point = applyCalibration({x:10,y:20},{xOffsetMm:2,yOffsetMm:-3,scalePercent:101});
  assert.equal(point.x, 10 * 1.01 + mmToPoints(2));
  assert.equal(point.y, 20 * 1.01 + mmToPoints(-3));
});

test('next document version never overwrites an existing version', () => {
  const { nextDocumentVersion } = require('../lib/po-core');
  assert.equal(nextDocumentVersion([{type:'SI',variant:'OVERLAY',version:1},{type:'SI',variant:'OVERLAY',version:3}], 'SI', 'OVERLAY'), 4);
  assert.equal(nextDocumentVersion([], 'DR', 'PREVIEW'), 1);
});
