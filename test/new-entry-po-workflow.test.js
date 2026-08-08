'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const integration=require('../public/po-entry-integration');

test('calculated PO becomes an editable New Entry draft with physical-carton conversion',()=>{
  const integration=require('../public/po-entry-integration');
  const calculated={
    customerCode:'WATSONS',branch:'DC3 PAMPANGA',poNumber:'9691669',poDate:'2026-07-24',requiredDeliveryDate:'2026-07-28',paymentTerms:'60 Days',deliveryAddress:'DC3 PAMPANGA',tin:'214-706-591-000',currency:'PHP',vatTreatment:'VAT_INCLUSIVE',
    lines:[
      {customerArticleNumber:'50033566',customerDescription:'FLUFFY SQUARE COTTON PADS',poQuantity:2,poUnit:'CASE',unitPrice:179,discount:0,lineAmount:37117.44,matched:true,internalProductName:'Cotton Pads Fluffy',sellingQuantity:288,physicalCartons:4,effectivePackPrice:128.88},
      {customerArticleNumber:'UNKNOWN',customerDescription:'UNKNOWN PRODUCT',poQuantity:1,poUnit:'CASE',unitPrice:100,discount:0,lineAmount:100,matched:false}
    ]
  };
  const draft=integration.buildEntryDraft(calculated,{documentDate:'2026-07-24'});
  assert.equal(draft.order.buyer,'WATSONS PAMPANGA');
  assert.equal(draft.order.poNumber,'9691669');
  assert.equal(draft.order.poDate,'2026-07-24');
  assert.equal(draft.order.deliveryDate,'2026-07-28');
  assert.equal(draft.order.dueDate,'2026-09-24');
  assert.equal(draft.lines[0].product,'Cotton Pads Fluffy');
  assert.equal(draft.lines[0].cases,4);
  assert.equal(draft.lines[0].packs,288);
  assert.equal(draft.lines[0].price,128.88);
  assert.equal(draft.lines[0].needsReview,false);
  assert.equal(draft.lines[1].product,'');
  assert.equal(draft.lines[1].needsReview,true);
});

test('Summary matching and latest documents stay inside one PO transaction',()=>{
  const integration=require('../public/po-entry-integration');
  const transactions=[
    {id:'PO-A',customerCode:'WATSONS',poNumber:'9691669',documents:[
      {poId:'PO-A',type:'SI',variant:'PREVIEW',version:1,fileId:'SI-A1'},
      {poId:'PO-A',type:'SI',variant:'PREVIEW',version:2,fileId:'SI-A2'},
      {poId:'PO-A',type:'DR',variant:'OVERLAY',version:1,fileId:'DR-A1'}]},
    {id:'PO-B',customerCode:'SM',poNumber:'1114753858',documents:[{poId:'PO-B',type:'SI',variant:'PREVIEW',version:9,fileId:'SI-B9'}]}
  ];
  const tx=integration.findSummaryTransaction({po:'9691669',buyerNames:['WATSONS PAMPANGA']},transactions);
  assert.equal(tx.id,'PO-A');
  const docs=integration.currentDocuments(tx);
  assert.equal(docs.siPreview.fileId,'SI-A2');
  assert.equal(docs.drOverlay.fileId,'DR-A1');
  assert.equal(docs.drPreview,null);
  assert.equal(integration.findSummaryTransaction({po:'9691669',buyerNames:['SM HYPERMARKET']},transactions),null);
});

test('draft preview is sign-in-free, deterministic, and does not save an order',()=>{
  const source=fs.readFileSync(path.join(root,'api','po','preview.js'),'utf8');
  assert.match(source,/getPoBootstrap/);
  assert.match(source,/applyMappingsAndCalculate/);
  assert.match(source,/PREVIEW.*OVERLAY|OVERLAY.*PREVIEW/);
  assert.doesNotMatch(source,/requireAuthenticated/);
  assert.doesNotMatch(source,/appendProducts|recordGeneratedDocuments|putPrivatePdf/);
});

test('SM canonical mappings feed both New Entry and preview fallback paths',()=>{
  const mappings=fs.readFileSync(path.join(root,'api','po','mappings.js'),'utf8');
  const preview=fs.readFileSync(path.join(root,'api','po','preview.js'),'utf8');
  assert.match(mappings,/mergeDefaultMappings\(bootstrap\.mappings/);
  assert.match(preview,/mergeDefaultMappings\(bootstrap\.mappings/);
});

test('product matching tolerates portal brand-word order',()=>{
  assert.equal(integration.resolvePortalProductName('Cotton Pads Fluffy',['Fluffy Cotton Pads','Fluffy Cotton Buds']),'Fluffy Cotton Pads');
  assert.equal(integration.resolvePortalProductName('Paper Towel Fluffy',['Fluffy Cotton Pads','Fluffy Paper Towel']),'Fluffy Paper Towel');
});

test('New Entry retains the SM vendor-rounding tolerance after reviewed line recalculation',()=>{
  const client=fs.readFileSync(path.join(root,'public','po-feature.js'),'utf8');
  assert.equal(integration.poTotalTolerance('SM'),0.25);
  assert.equal(integration.poTotalTolerance('WATSONS'),0.01);
  assert.match(client,/calculateTotals\(calculated\.lines,calculated\.poTotal,Entry\.poTotalTolerance\(calculated\.customerCode\)\)/);
});

test('entry pack price keeps enough precision to reproduce the official PO total',()=>{
  const draft=integration.buildEntryDraft({customerCode:'WATSONS',poNumber:'1',poTotal:1293.79,lines:[{
    matched:true,internalProductName:'Kitchen Towel Fluffy',sellingQuantity:12,physicalCartons:1,lineAmount:1293.79
  }]});
  assert.equal(draft.lines[0].price,107.815833);
  assert.equal(Math.round(draft.lines[0].price*12*100)/100,1293.79);
});

test('SI and DR filenames use buyer-first format, Watsons source ID, PO date, and Windows-safe date',()=>{
  const watsons={customerCode:'WATSONS',sourceFilename:'mail-1116551101_0_PO97143905500588.pdf',poNumber:'9714390',documentDate:'2026-07-27'};
  assert.equal(integration.documentFilename('SI',watsons),'WATSONS PO97143905500588 9714390 SI 7-27-26.pdf');
  assert.equal(integration.documentFilename('DR',watsons),'WATSONS PO97143905500588 9714390 DR 7-27-26.pdf');
  assert.equal(integration.documentFilename('SI',{customerName:'SUPER SHOPPING MARKET, INC.',sourceFilename:'7.18.pdf',poNumber:'1114753858',documentDate:'2026-07-27'}),'SM SI 1114753858 7-27-26.pdf');
  assert.equal(integration.documentFilename('DR',{customerName:'SUPER SHOPPING MARKET, INC.',sourceFilename:'7.18.pdf',poNumber:'1114753858',documentDate:'2026-07-27'}),'SM DR 1114753858 7-27-26.pdf');
});

test('New Entry uses PO date before delivery date and falls back to Manila today',()=>{
  const dated=integration.buildEntryDraft({customerCode:'WATSONS',poNumber:'9714390',poDate:'2026-07-27',requiredDeliveryDate:'2026-07-31',lines:[]});
  assert.equal(dated.order.documentDate,'2026-07-27');
  assert.equal(integration.manilaDateIso(new Date('2026-07-26T16:30:00Z')),'2026-07-27');
  const client=fs.readFileSync(path.join(root,'public','po-feature.js'),'utf8');
  assert.match(client,/documentDate:calculated\.poDate\|\|Entry\.manilaDateIso\(\)/);
  assert.doesNotMatch(client,/documentDate:calculated\.requiredDeliveryDate/);
});

test('PO-imported preview, save, and document totals use packs times reviewed pack price',()=>{
  const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
  const client=fs.readFileSync(path.join(root,'public','po-feature.js'),'utf8');
  assert.match(html,/WarehousePOEntry\.entryLineAmount\(\{packs,cases,price,priceUnit:getEntryPriceUnit\(product,buyer\),poWorkflow/);
  assert.match(html,/priceUnit: options\.poWorkflow \? 'PACK' : getEntryPriceUnit\(item\.product,buyer\)/);
  assert.match(client,/reviewedPackPrice:num\(line\.querySelector\('\.entry-price'\)\.value\)/);
  assert.match(client,/priceInput\.step='0\.000000001'/);
  assert.match(client,/price\.step='0\.01'/);
  assert.match(client,/calculatedAmount:Entry\.entryLineAmount\(\{packs:lines\[index\]\.reviewedPacks,cases:lines\[index\]\.reviewedCases,price:lines\[index\]\.reviewedPackPrice,poWorkflow:true\}\)/);
  assert.match(client,/poLineAmount:lines\[index\]\.lineAmount/);
});

test('draft PDFs use the calculated fast path, cache promises, prefetch variants, and show immediate progress',()=>{
  const client=fs.readFileSync(path.join(root,'public','po-feature.js'),'utf8');
  const api=fs.readFileSync(path.join(root,'api','po','preview.js'),'utf8');
  assert.match(client,/body:JSON\.stringify\(\{type,variant,reviewed,calculated\}\)/);
  assert.match(client,/draftPdfPromises/);
  assert.match(client,/prefetchDraftPdfs/);
  assert.match(client,/Preparing .*Print PDF/);
  assert.match(api,/body\.calculated/);
  assert.match(api,/documentFilename/);
});

test('saved generated SI and DR files use the shared requested filename',()=>{
  const generate=fs.readFileSync(path.join(root,'api','po','generate.js'),'utf8');
  assert.match(generate,/documentFilename\(type/);
  assert.doesNotMatch(generate,/\$\{type\}-\$\{stored\.poNumber\}-\$\{variant\.toLowerCase\(\)\}/);
});

test('New Entry owns upload actions and Summary places PDF SI DR immediately after Due By',()=>{
  const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
  const entryStart=html.indexOf('<div id="page-entry"');
  const entryEnd=html.indexOf('<!-- == RESTOCK == -->',entryStart);
  const entry=html.slice(entryStart,entryEnd);
  assert.ok(entry.indexOf('id="entryUploadPanel"')>0);
  assert.ok(entry.indexOf('id="entryUploadPanel"')<entry.indexOf('class="two-col"'));
  assert.ok(entry.includes('id="poDownloadDr"'));
  assert.ok(!entry.includes('id="poAuthPanel"'));
  assert.ok(!entry.includes('Username'));
  assert.ok(!entry.includes('Password'));
  assert.ok(!entry.includes('Upload one customer PO'));
  assert.ok(!entry.includes('entry-po-source'));
  assert.ok(!entry.includes('Extracted PO line'));
  for(const removedId of ['e-po-date','e-delivery-date','e-due-date','e-terms','e-location','e-tin','e-address'])assert.ok(!entry.includes(`id="${removedId}"`));
  assert.ok(entry.includes('id="e-si"'));
  for(const state of ['Not uploaded','Uploading','Extracting','Needs review','Ready to preview','Ready to download','Failed'])assert.ok(html.includes(state));
  assert.doesNotMatch(html,/navigate\('po-documents'\)[\s\S]{0,180}PO to SI\/DR/);
  const summaryHead=html.match(/<table id="summaryTable">[\s\S]*?<\/thead>/i)[0].replace(/\s+/g,' ');
  assert.match(summaryHead,/Due By<\/th>\s*<th[^>]*>PDF<\/th>\s*<th[^>]*>SI<\/th>\s*<th[^>]*>DR<\/th>/i);
  const previewColumn=entry.match(/<div class="entry-preview-col">[\s\S]*?<div class="card entry-preview-card">[\s\S]*?<\/div>\s*<button class="btn btn-primary entry-submit-button"[\s\S]*?Submit Entry[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*<!-- Recent Entries Table -->/i);
  assert.ok(previewColumn,'Submit Entry must be directly beneath Order Preview inside the right column');
  assert.equal((entry.match(/id="entrySubmitButton"/g)||[]).length,1,'Submit Entry must be moved, not duplicated');
  const poCss=fs.readFileSync(path.join(root,'public','po-feature.css'),'utf8');
  assert.match(poCss,/#page-summary #summaryTable thead th\s*\{[\s\S]*?border-top\s*:\s*1px solid var\(--border\)!important/i);
  assert.match(poCss,/#page-summary #summaryTable thead th:first-child\s*\{\s*border-left\s*:\s*1px solid var\(--border\)!important\s*\}/i);
  assert.match(poCss,/#page-summary #summaryTable thead th:last-child\s*\{\s*border-right\s*:\s*1px solid var\(--border\)!important\s*\}/i);
  assert.match(poCss,/\.entry-preview-col\s+\.entry-submit-button\s*\{[\s\S]*?margin-top\s*:\s*14px/i);
  assert.match(html,/#page-entry \.two-col\s*\{[^}]*align-items:\s*start\s*!important/i,'New Entry columns must not stretch Order Preview to Order Details height');
  assert.match(html,/#page-entry \.entry-preview-col\s*\{[^}]*min-height:\s*0/i);
  assert.match(html,/#page-entry \.entry-preview-card\s*\{[^}]*height:\s*auto[^}]*min-height:\s*0/i,'Submit Entry must follow the preview content, not the full left-column height');
  assert.match(poCss,/\.po-state\.is-ready-to-preview\s*\{\s*display\s*:\s*none/i);
  assert.match(html,/#summaryTable th:nth-child\(12\)[\s\S]*?width:\s*5%/i);
  assert.match(html,/\.summary-terminal-card\s*\{[\s\S]*?transform:\s*none/i);
  assert.match(html,/\.summary-terminal-wrap\s*\{[\s\S]*?overflow-x:\s*auto/i);
  assert.match(html,/#page-summary #summaryTable thead th\{position:static!important;top:auto!important/i);
  assert.match(html,/#page-summary #summaryTable tbody tr:hover>td\{background:#151819!important/i);
  assert.match(html,/id="poDocumentModal"/);
  assert.doesNotMatch(html,/Preview PDFs stay upright/i);
  assert.doesNotMatch(html,/Print PDFs are rotated 180° for bottom-edge-first feeding/i);
  assert.doesNotMatch(html,/id="poDocumentList"/);
  assert.match(html,/Download SI Print PDF/i);
  assert.match(html,/Download DR Print PDF/i);
});

test('Summary documents are icon-only preview actions and the modal is solid full-height',()=>{
  const client=fs.readFileSync(path.join(root,'public','po-feature.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'public','po-feature.css'),'utf8');
  assert.match(client,/summary-pdf-symbol/);
  assert.match(client,/previewButton\('PO','Preview original PO PDF'\)/);
  assert.match(client,/previewButton\('SI','Preview SI PDF'\)/);
  assert.match(client,/previewButton\('DR','Preview DR PDF'\)/);
  assert.match(client,/openSummaryDocument/);
  assert.doesNotMatch(client,/po-row-doc-menu/);
  assert.doesNotMatch(client,/<span>View PO<\/span>/);
  assert.match(css,/#page-summary #summaryTable tbody tr:hover>td\s*\{[^}]*background:#151819!important/i);
  assert.match(css,/#page-summary #summaryTable thead th\s*\{[^}]*background:transparent!important/i);
  assert.match(css,/#page-summary\s*\{[^}]*background:transparent!important/i);
  assert.match(css,/#page-summary #summaryTable thead th\s*\{[^}]*padding-top:9px!important[^}]*padding-bottom:8px!important[^}]*height:auto!important[^}]*min-height:0!important/i);
  assert.match(css,/#page-summary \.summary-terminal-card\s*\{[^}]*border-top:0!important/i);
  assert.match(css,/#page-summary #summaryTable thead th:first-child\s*\{[^}]*border-left:1px solid var\(--border\)!important/i);
  assert.match(css,/#page-summary #summaryTable thead th:last-child\s*\{[^}]*border-right:1px solid var\(--border\)!important/i);
  assert.match(css,/#page-summary #summaryTable\s*\{[^}]*border:0!important/i);
  assert.match(css,/\.po-document-modal\s*\{[^}]*background:#090a0b!important/i);
  assert.match(css,/\.po-document-dialog\s*\{[^}]*height:calc\(100vh - 32px\)!important/i);
  assert.match(css,/\.po-document-frame\s*\{[^}]*flex:1 1 auto!important/i);
});

test('Summary and Recent Entries use a wider balanced desktop table canvas',()=>{
  const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'public','po-feature.css'),'utf8');
  assert.match(html,/class="card entry-recent-card"/);
  assert.match(css,/body #content:has\(#page-summary\.active\)[\s\S]*?max-width:1600px!important/);
  assert.match(css,/#page-entry > \.entry-upload-panel[\s\S]*?max-width:1280px!important/);
  const widths=(tableId,count)=>{
    const values=Array(count).fill(null);
    for(const match of css.matchAll(/([^{}]+)\{width:(\d+)%!important\}/g)){
      if(!match[1].includes(`#${tableId}`))continue;
      for(const column of match[1].matchAll(/nth-child\((\d+)\)/g)) values[Number(column[1])-1]=Number(match[2]);
    }
    values.forEach((value,index)=>assert.notEqual(value,null,`${tableId} column ${index+1} width missing`));
    return values;
  };
  assert.equal(widths('summaryTable',12).reduce((sum,value)=>sum+value,0),100);
  assert.equal(widths('entryRecentTable',11).reduce((sum,value)=>sum+value,0),100);
});
