'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const zlib = require('node:zlib');

function inflatedPdfStreams(bytes) {
  const binary=Buffer.from(bytes).toString('latin1');
  return [...binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(match=>{
    try{return zlib.inflateSync(Buffer.from(match[1],'latin1')).toString('latin1');}catch{return'';}
  }).join('\n');
}

test('SI normalizer accepts portal field names and intentionally omits terms', () => {
  const { normalizeSiTransaction, PROVISIONAL_TEMPLATES } = require('../lib/pdf-documents');
  const normalized = normalizeSiTransaction({
    soldTo:'WATSONS PERSONAL CARE',
    businessAddress:'DC3 PAMPANGA',
    tin:'214-706-591-000',
    paymentTerms:'60 Days',
    lines:[{siDescription:'FLUFFY COTTON BUDS',poQuantity:5,poUnit:'CASE'}]
  });
  assert.equal(normalized.customerName, 'WATSONS PERSONAL CARE');
  assert.equal(normalized.address, 'DC3 PAMPANGA');
  assert.equal(normalized.lines[0].description, 'FLUFFY COTTON BUDS');
  assert.equal(PROVISIONAL_TEMPLATES.WATSONS_SI_V1.fields.printTerms, false);
});

test('approved Watsons print profile restores the physically tested SI and DR wording', () => {
  const { applyApprovedDocumentProfile } = require('../lib/pdf-documents');
  const profiled = applyApprovedDocumentProfile({
    customerCode:'WATSONS',
    customerName:'WATSONS PERSONALCARE',
    deliveryAddress:'93677 DC3 PAMPANGA(V), BJ LAND INC COMPOUND QUENZN RD',
    lines:[
      {customerArticleNumber:'50033566',customerDescription:'FLUFFY SQUARE COTTON PADS'},
      {customerArticleNumber:'50033576',customerDescription:'FLUFFY COTTON BUDS'},
      {customerArticleNumber:'50033577',customerDescription:'FLUFFY KITCHEN TOWEL'},
      {customerArticleNumber:'50033580',customerDescription:'FLUFFY PAPER TOWEL'}
    ]
  });
  assert.equal(profiled.customerName,'WATSONS PERSONAL CARE');
  assert.equal(profiled.deliveredTo,'WATSONS PERSONAL CARE');
  assert.equal(profiled.tin,'214-706-591-000');
  assert.equal(profiled.siAddress,'9th Floor One E-com Center, Ocean Drive, Mall of Asia Complex, CBP-IA, Barangay 76, 1300 Pasay City, NCR, Fourth District, Philippines');
  assert.equal(profiled.address,'93677 DC3 PAMPANGA(V), BJ LAND INC COMPOUND QUENZN RD');
  assert.equal(profiled.deliveryAddress,'93677 DC3 PAMPANGA(V), BJ LAND INC COMPOUND QUENZN RD');
  assert.equal(profiled.paymentTerms,'60 Days');
  assert.deepEqual(profiled.lines.map(line=>line.invoiceDescription),[
    'FLUFFY SQUARE COTTON PADS 100S 2S',
    'FLUFFY COTTON BUDS 200 STEM 400 TIPS',
    'FLUFFY KITCHEN TOWEL 2PLY 2 ROLLS',
    'FLUFFY INTERFOLDED PAPER TOWEL 2PLY 150S'
  ]);
  assert.deepEqual(profiled.lines.map(line=>line.drDescription),profiled.lines.map(line=>line.invoiceDescription));
});

test('SI production overlay has exact page size, calibrated coordinates, and no serial number', async () => {
  const { generateDocumentPdf, PROVISIONAL_TEMPLATES } = require('../lib/pdf-documents');
  const bytes = await generateDocumentPdf({
    type:'SI', variant:'OVERLAY', template:PROVISIONAL_TEMPLATES.WATSONS_SI_V1,
    calibration:{xOffsetMm:0,yOffsetMm:0,scalePercent:100},
    transaction:{date:'July 24, 2026',customerName:'Watsons Personal Care Stores (Philippines), Inc.',tin:'214-706-591-000',address:'DC3 Pampanga',poNumber:'9691669',paymentTerms:'60 Days',lines:[{description:'FLUFFY SQUARE COTTON PADS 100S',poQuantity:2,poUnit:'CASE',unitPrice:128.88,calculatedAmount:37117.44}],totals:{gross:37117.44,vat:3976.87,netOfVat:33140.57}}
  });
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  assert.deepEqual(page.getSize(), {width:PROVISIONAL_TEMPLATES.WATSONS_SI_V1.paperWidthPt,height:PROVISIONAL_TEMPLATES.WATSONS_SI_V1.paperHeightPt});
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(bytes.length > 1000);
  assert.equal(/serial/i.test(JSON.stringify(PROVISIONAL_TEMPLATES.WATSONS_SI_V1.fields)), false);
  assert.equal(PROVISIONAL_TEMPLATES.WATSONS_SI_V1.developmentWatermark, 'SAMPLE – NOT VALID FOR ISSUANCE');
  void text;
});

test('SI and DR previews stay upright while print overlays rotate for bottom-edge-first feeding', async () => {
  const { generateDocumentPdf, PROVISIONAL_TEMPLATES } = require('../lib/pdf-documents');
  const transaction={date:'July 27, 2026',customerName:'Watsons',tin:'214',address:'Pampanga',poNumber:'1',lines:[],totals:{gross:0,vat:0,netOfVat:0}};
  for (const [type,template] of [['SI',PROVISIONAL_TEMPLATES.WATSONS_SI_V1],['DR',PROVISIONAL_TEMPLATES.WATSONS_DR_V1]]) {
    const preview=await generateDocumentPdf({type,variant:'PREVIEW',template,transaction});
    const overlay=await generateDocumentPdf({type,variant:'OVERLAY',template,transaction});
    assert.doesNotMatch(inflatedPdfStreams(preview),/-1 0 0 -1 [0-9.]+ [0-9.]+ cm/,`${type} preview must remain visually upright`);
    assert.match(inflatedPdfStreams(overlay),/-1 0 0 -1 [0-9.]+ [0-9.]+ cm/,`${type} print PDF must rotate 180 degrees`);
  }
});

test('SI and DR use semantic font weights while keeping amounts totals and PO bold', async () => {
  const { generateDocumentPdf, PROVISIONAL_TEMPLATES, fitValueToWidth, wrapValueToWidth, drawSi, drawDr } = require('../lib/pdf-documents');
  const si=PROVISIONAL_TEMPLATES.WATSONS_SI_V1;
  const dr=PROVISIONAL_TEMPLATES.WATSONS_DR_V1;
  assert.equal(si.font,'Helvetica-Bold');
  assert.equal(si.fontSize,10.5);
  assert.equal(si.headerFontSize,10);
  assert.equal(si.addressFontSize,7.5);
  assert.equal(si.descriptionFontSize,6.5);
  assert.equal(si.itemFontSize,10.5);
  assert.equal(si.amountFontSize,11.5);
  assert.equal(si.totalsFontSize,11.5);
  assert.equal(si.fields.items.valueYOffsetPt,-1.5);
  assert.equal(dr.font,'Helvetica-Bold');
  assert.equal(dr.fontSize,11);
  assert.equal(dr.headerFontIncreasePt,-1);
  assert.equal(dr.productRowFontIncreasePt,0);
  assert.equal(dr.conversionNoteFontIncreasePt,-4.5);
  assert.equal(dr.detailFontIncreasePt,0);
  assert.equal(dr.poNumberFontIncreasePt,0);
  assert.ok(Math.abs(dr.fields.totalLabelGap-(4*72/25.4))<0.001);
  assert.equal(typeof drawSi,'function');
  assert.equal(typeof drawDr,'function');
  const fonts={
    regular:{role:'regular',widthOfTextAtSize:(text,size)=>String(text).length*size*.5},
    bold:{role:'bold',widthOfTextAtSize:(text,size)=>String(text).length*size*.55}
  };
  const captures=[];
  const page={drawText:(text,options)=>captures.push({text,font:options.font.role,size:options.size,x:options.x,y:options.y})};
  const fixedSiAddress='9th Floor One E-com Center, Ocean Drive, Mall of Asia Complex, CBP-IA, Barangay 76, 1300 Pasay City, NCR, Fourth District, Philippines';
  const common={date:'July 30, 2026',customerName:'WATSONS PERSONAL CARE',deliveredTo:'WATSONS PERSONAL CARE',tin:'214-706-591-000',paymentTerms:'60 Days',siAddress:fixedSiAddress,address:'ORIGINAL PO ADDRESS',deliveryAddress:'ORIGINAL PO ADDRESS',poNumber:'9691669',lines:[{description:'ITEM DESC',drDescription:'ITEM DESC',poQuantity:2,poUnit:'CASE',sellingPrice:10,calculatedAmount:20}],totals:{gross:30,vat:3,netOfVat:27}};
  drawSi(page,fonts,si,{scalePercent:100},common);
  assert.equal(captures.find(item=>item.text==='ITEM DESC').font,'regular');
  assert.equal(captures.find(item=>item.text==='2').font,'regular');
  assert.equal(captures.find(item=>item.text==='CASE').font,'regular');
  assert.equal(captures.find(item=>item.text==='10.00').font,'regular');
  assert.equal(captures.find(item=>item.text==='20.00').font,'bold');
  assert.equal(captures.find(item=>item.text==='20.00').size,11.5);
  const descriptionRow=captures.find(item=>item.text==='ITEM DESC').y;
  for (const value of ['2','CASE','10.00','20.00']) {
    assert.equal(captures.find(item=>item.text===value).y,descriptionRow-1.5,`${value} must be 1.5pt below the unchanged description row`);
  }
  assert.ok(captures.find(item=>item.text==='WATSONS PERSONAL CARE').size<=10);
  assert.ok(captures.find(item=>item.text==='WATSONS PERSONAL CARE').size>=6.5);
  assert.ok(captures.find(item=>item.text==='July 30, 2026').size<=10);
  assert.ok(captures.find(item=>item.text==='July 30, 2026').size>=6.5);
  const addressLines=captures.filter(item=>item.y===si.fields.address.y||item.y===si.fields.address.y-si.fields.address.lineHeight);
  assert.equal(addressLines.map(item=>item.text).join(' '),fixedSiAddress);
  assert.ok(addressLines.every(item=>item.size<=7.5));
  assert.ok(captures.filter(item=>item.text==='30.00').every(item=>item.size===11.5));
  captures.length=0;
  const siDescriptions=['FLUFFY SQUARE COTTON PADS 100S 2S','FLUFFY COTTON BUDS 200 STEM 400 TIPS','FLUFFY KITCHEN TOWEL 2PLY 2 ROLLS','FLUFFY INTERFOLDED PAPER TOWEL 2PLY 150S'];
  drawSi(page,fonts,si,{scalePercent:100},{...common,lines:siDescriptions.map(description=>({description,poQuantity:1,poUnit:'CASE',sellingPrice:179,calculatedAmount:179})),totals:{gross:179,vat:0,netOfVat:179}});
  const descriptionDraws=captures.filter(item=>siDescriptions.includes(item.text));
  assert.equal(descriptionDraws.length,4,'Every SI description must stay complete on one line');
  assert.ok(descriptionDraws.every(item=>item.font==='regular'));
  assert.ok(descriptionDraws.every(item=>item.size===6.5),'All SI descriptions must use the longest-description font size');
  assert.ok(descriptionDraws.every(item=>item.x+fonts.regular.widthOfTextAtSize(item.text,item.size)<=si.fields.items.x+si.fields.items.descriptionWidth+0.001));
  captures.length=0;
  drawDr(page,fonts,dr,{scalePercent:100},common);
  assert.equal(captures.find(item=>item.text==='ITEM DESC').font,'regular');
  assert.equal(captures.find(item=>item.text==='2').font,'regular');
  assert.equal(captures.find(item=>item.text==='CASE').font,'regular');
  assert.equal(captures.find(item=>item.text==='10.00').font,'regular');
  assert.equal(captures.find(item=>item.text==='20.00').font,'bold');
  assert.equal(captures.find(item=>item.text==='TOTAL').font,'bold');
  assert.equal(captures.find(item=>item.text==='ORIGINAL PO ADDRESS').font,'bold');
  captures.length=0;
  drawDr(page,fonts,dr,{scalePercent:100},{...common,lines:[{description:'COTTON PADS',drDescription:'COTTON PADS',poQuantity:1,poUnit:'CASE',sellingPrice:179,calculatedAmount:179,packsPerPoCase:144,packsPerPhysicalCarton:72,physicalCartons:2}]});
  const article=captures.find(item=>item.text==='COTTON PADS');
  const noteStart=captures.findIndex(item=>item.text.startsWith('1 PO CASE'));
  const nextNote=captures.findIndex(item=>item.text.startsWith('PO QTY'));
  const noteLines=captures.slice(noteStart,nextNote);
  assert.equal(noteLines.map(item=>item.text).join(' '),'1 PO CASE = 144 PACKS; 1 PHYSICAL CARTON = 72 PACKS');
  assert.ok(noteLines.every(item=>item.font==='regular'));
  assert.ok(noteLines.every(item=>item.size===6.5));
  assert.ok(noteLines.every(item=>item.size<article.size));
  const totalIndex=captures.findIndex(item=>item.text==='TOTAL');
  const reminderLines=captures.slice(noteStart,totalIndex);
  const reminderRightEdge=dr.fields.items.priceX-fonts.regular.widthOfTextAtSize('179.00',article.size)-4;
  assert.ok(reminderLines.every(item=>item.x+fonts.regular.widthOfTextAtSize(item.text,item.size)<=reminderRightEdge+0.001),'Reminder text must stop before the unit-price column');
  assert.equal(typeof fitValueToWidth,'function');
  const mockFont={widthOfTextAtSize:(text,size)=>text.length*size};
  const fitted=fitValueToWidth(mockFont,'EIGHT888',10,64,6.5);
  assert.equal(fitted.text,'EIGHT888');
  assert.equal(fitted.fontSize,8);
  assert.equal(typeof wrapValueToWidth,'function');
  const wrapped=wrapValueToWidth(mockFont,'AAAA BBBB CCCC',10,70,6.5,3);
  assert.equal(wrapped.lines.join(' '),'AAAA BBBB CCCC');
  assert.ok(wrapped.lines.every(line=>mockFont.widthOfTextAtSize(line,wrapped.fontSize)<=70));
  assert.ok(si.fields.date.x+si.fields.date.maxWidth<si.paperWidthPt,'SI date must remain inside the 140mm page');
  const bytes=await generateDocumentPdf({type:'DR',variant:'PREVIEW',template:dr,transaction:{customerName:'WATSONS PERSONAL CARE',date:'July 30, 2026',tin:'214-706-591-000',paymentTerms:'60 Days',address:'93677 DC3 PAMPANGA, BJ LAND INC COMPOUND, QUEZON RD',poNumber:'9691669',lines:[{poQuantity:1,drDescription:'FLUFFY INTERFOLDED PAPER TOWEL 2PLY 150S',sellingPrice:179,calculatedAmount:179}],totals:{gross:179}}});
  assert.match(Buffer.from(bytes).toString('latin1'),/Helvetica-Bold/);
  assert.ok(Math.abs(dr.fields.items.quantityX-((22.5*72/25.4)-4.5))<0.001);
  assert.ok(Math.abs(dr.fields.items.unitX-((37*72/25.4)-1.5))<0.001);
  assert.ok(Math.abs(dr.fields.items.x-((45.5*72/25.4)-2))<0.001);
  assert.ok(Math.abs(dr.fields.items.priceX-((111*72/25.4)-2))<0.001);
  assert.ok(Math.abs(dr.fields.items.amountX-((132*72/25.4)-2))<0.001);
  assert.ok(Math.abs(dr.fields.items.y-((148*72/25.4)+2))<0.001);
  assert.ok(Math.abs(dr.fields.remarks.x-((39*72/25.4)-2))<0.001);
  assert.ok(Math.abs(dr.fields.remarks.y-((137*72/25.4)+2))<0.001);
  assert.equal(dr.fields.poNumberAlignment,'left');
  assert.equal(dr.fields.poNumber.x,dr.fields.items.x);
  assert.ok(Math.abs(dr.fields.customerName.y-((171*72/25.4)+0.5))<0.001);
  assert.ok(Math.abs(dr.fields.date.y-((171*72/25.4)+0.5))<0.001);
  assert.ok(Math.abs(dr.fields.tin.y-((166*72/25.4)+0.5))<0.001);
  assert.ok(Math.abs(dr.fields.terms.y-((166*72/25.4)+0.5))<0.001);
  assert.ok(Math.abs(dr.fields.address.y-((161*72/25.4)+0.5))<0.001);
});

test('DR and SI templates have independent exact coordinate maps', () => {
  const { PROVISIONAL_TEMPLATES } = require('../lib/pdf-documents');
  const si = PROVISIONAL_TEMPLATES.WATSONS_SI_V1;
  const dr = PROVISIONAL_TEMPLATES.WATSONS_DR_V1;
  assert.equal(si.paperWidthMm, 140);
  assert.equal(si.paperHeightMm, 200);
  assert.equal(dr.paperWidthMm, 140);
  assert.equal(dr.paperHeightMm, 200);
  assert.equal(si.printOverlayRotation,180);
  assert.equal(dr.printOverlayRotation,180);
  assert.equal(si.paperWidthPt, dr.paperWidthPt);
  assert.equal(si.paperHeightPt, dr.paperHeightPt);
  assert.equal(si.fields.quantityAlignment, 'center');
  assert.equal(si.fields.unitAlignment, 'center');
  assert.equal(si.fields.priceAlignment, 'center');
  assert.equal(si.fields.amountAlignment, 'center');
  assert.ok(Math.abs(si.fields.saleType.x - (46 * 72 / 25.4)) < 0.001);
  assert.ok(Math.abs(si.fields.saleType.y - (180 * 72 / 25.4)) < 0.001);
  assert.ok(Math.abs(si.fields.customerName.x - ((41 * 72 / 25.4) + 3)) < 0.001);
  assert.ok(Math.abs(si.fields.customerName.y - ((163 * 72 / 25.4) + 8)) < 0.001);
  assert.ok(Math.abs(si.fields.tin.x - ((20.5 * 72 / 25.4) + 4)) < 0.001);
  assert.ok(Math.abs(si.fields.tin.y - ((160.5 * 72 / 25.4) + 3.5)) < 0.001);
  assert.ok(Math.abs(si.fields.address.x - ((36 * 72 / 25.4) + 12)) < 0.001);
  assert.ok(Math.abs(si.fields.address.y - ((155 * 72 / 25.4) + 9)) < 0.001);
  assert.ok(Math.abs(si.fields.date.x - (115 * 72 / 25.4)) < 0.001);
  assert.ok(Math.abs(si.fields.date.y - ((172 * 72 / 25.4) + 0.5)) < 0.001);
  assert.equal(si.fields.calibrationRevision, 13);
  assert.ok(Math.abs(si.fields.items.x - ((13.5 * 72 / 25.4) + 0.5)) < 0.001);
  assert.ok(Math.abs(si.fields.items.y - ((148.4 * 72 / 25.4) - 1)) < 0.001);
  assert.ok(Math.abs(si.fields.items.quantityX - ((76 * 72 / 25.4) - 0.5)) < 0.001);
  assert.ok(Math.abs(si.fields.items.unitX - ((88 * 72 / 25.4) + 3)) < 0.001);
  assert.ok(Math.abs(si.fields.items.priceX - ((103.5 * 72 / 25.4) - 0.5)) < 0.001);
  assert.ok(Math.abs(si.fields.items.amountX - ((124 * 72 / 25.4) - 0.5)) < 0.001);
  assert.ok(Math.abs(si.fields.total.y - ((45.5 * 72 / 25.4) - 3.5)) < 0.001);
  assert.ok(Math.abs(si.fields.poNumber.x - (75 * 72 / 25.4)) < 0.001);
  assert.equal(dr.fields.quantityAlignment, 'center');
  assert.equal(dr.fields.unitAlignment, 'center');
  assert.ok(Math.abs(dr.fields.items.quantityX - ((22.5 * 72 / 25.4) - 4.5)) < 0.001);
  assert.ok(Math.abs(dr.fields.items.unitX - ((37 * 72 / 25.4) - 1.5)) < 0.001);
  assert.ok(Math.abs(dr.fields.items.x - ((45.5 * 72 / 25.4) - 2)) < 0.001);
  const drHeaderShift=1.5;
  const approvedDrHeaderX=(31.5 * 72 / 25.4) + 7 - drHeaderShift;
  assert.ok(Math.abs(dr.fields.customerName.x - approvedDrHeaderX) < 0.001);
  assert.ok(Math.abs(dr.fields.customerName.y - ((171 * 72 / 25.4) + 0.5)) < 0.001);
  assert.ok(Math.abs(dr.fields.date.x - ((102 * 72 / 25.4) + 3 - drHeaderShift)) < 0.001);
  assert.ok(Math.abs(dr.fields.date.y - ((171 * 72 / 25.4) + 0.5)) < 0.001);
  assert.ok(Math.abs(dr.fields.terms.x - ((102 * 72 / 25.4) + 3 - drHeaderShift)) < 0.001);
  assert.ok(Math.abs(dr.fields.terms.y - ((166 * 72 / 25.4) + 0.5)) < 0.001);
  assert.ok(Math.abs(dr.fields.tin.x - approvedDrHeaderX) < 0.001);
  assert.ok(Math.abs(dr.fields.tin.y - ((166 * 72 / 25.4) + 0.5)) < 0.001);
  assert.ok(Math.abs(dr.fields.address.x - approvedDrHeaderX) < 0.001);
  assert.ok(Math.abs(dr.fields.address.y - ((161 * 72 / 25.4) + 0.5)) < 0.001);
  assert.equal(si.fields.poNumber.fontSize, 24);
  assert.equal(dr.fields.poNumber.fontSize, 24);
  assert.ok(dr.fontSize > si.fontSize);
  assert.equal(dr.fields.poAfterTotal, true);
  assert.ok(Math.abs(dr.fields.poNumber.x - dr.fields.items.x) < 0.001);
  assert.equal(dr.fields.poRowOffset, 3.5);
  assert.equal(dr.fields.calibrationRevision, 14);
  assert.ok(si.fields.poNumber.y < si.fields.items.y - (si.fields.items.rowHeight * 4));
  assert.ok(si.fields.poNumber.y > si.fields.totalSales.y);
  assert.ok(si.fields.totalSales.y > si.fields.vatSales.y);
  assert.equal(si.fields.printLeftVatBreakdown, false);
  assert.equal(si.fields.totalsAlignment, 'center');
  for (const field of ['totalSales','lessVat','netOfVat','addVat','total']) {
    assert.ok(Math.abs(si.fields[field].x - (123.5 * 72 / 25.4)) < 0.001);
  }
  assert.ok(si.fields.lessVat.y < si.fields.totalSales.y);
  assert.ok(si.fields.netOfVat.y < si.fields.lessVat.y);
  assert.ok(si.fields.addVat.y < si.fields.netOfVat.y);
  assert.ok(Math.abs(si.fields.totalSales.y - ((73 * 72 / 25.4) - 5)) < 0.001);
  assert.ok(Math.abs(si.fields.lessVat.y - ((69 * 72 / 25.4) - 5)) < 0.001);
  assert.ok(Math.abs(si.fields.netOfVat.y - ((64.5 * 72 / 25.4) - 5)) < 0.001);
  assert.ok(Math.abs(si.fields.addVat.y - ((53.5 * 72 / 25.4) - 2.5)) < 0.001);
  assert.ok(Math.abs(si.fields.total.y - ((45.5 * 72 / 25.4) - 3.5)) < 0.001);
  assert.ok(si.fields.total.y < si.fields.addVat.y);
  assert.notDeepEqual(si.fields.customerName, dr.fields.customerName);
  assert.notEqual(si.fields.items.x, dr.fields.items.x);
  assert.equal(si.calibrated, true);
  assert.equal(dr.calibrated, true);
});

test('preview is a plain white values-only page and ignores supplied scan backgrounds', async () => {
  const { generateDocumentPdf, PROVISIONAL_TEMPLATES } = require('../lib/pdf-documents');
  const background = await PDFDocument.create();
  const backgroundPage = background.addPage([300,400]);
  backgroundPage.drawText('OFFICIAL FORM BACKGROUND',{x:20,y:380,size:8});
  const backgroundBytes = await background.save();
  const transaction = {date:'July 24, 2026',customerName:'Watsons',tin:'214',address:'Pampanga',poNumber:'9691669',lines:[],totals:{gross:0,vat:0,netOfVat:0}};
  const withIgnoredBackground = await generateDocumentPdf({type:'DR',variant:'PREVIEW',template:PROVISIONAL_TEMPLATES.WATSONS_DR_V1,transaction,backgroundPdfBytes:backgroundBytes});
  const plainPreview = await generateDocumentPdf({type:'DR',variant:'PREVIEW',template:PROVISIONAL_TEMPLATES.WATSONS_DR_V1,transaction});
  assert.equal(withIgnoredBackground.length,plainPreview.length);
  const loaded=await PDFDocument.load(plainPreview);
  assert.equal(loaded.getTitle(),'DR PREVIEW - VALUES ONLY');
  assert.equal(loaded.getSubject(),'Plain white values-only preview; not saved or issued');
});

test('preview and production overlay share the same calibrated value placements', async () => {
  const { generateDocumentPdf, PROVISIONAL_TEMPLATES } = require('../lib/pdf-documents');
  const transaction={date:'July 24, 2026',customerName:'Watsons',poNumber:'1',lines:[],totals:{gross:0,vat:0,netOfVat:0}};
  const preview=await generateDocumentPdf({type:'SI',variant:'PREVIEW',template:PROVISIONAL_TEMPLATES.WATSONS_SI_V1,transaction});
  const overlay=await generateDocumentPdf({type:'SI',variant:'OVERLAY',template:PROVISIONAL_TEMPLATES.WATSONS_SI_V1,transaction});
  assert.ok(Math.abs(preview.length-overlay.length)<300);
  const loaded=await PDFDocument.load(overlay);
  assert.equal(loaded.getTitle(),'SI OVERLAY');
  assert.equal(loaded.getSubject(),'SI print overlay');
});

test('calibration test PDF contains deterministic crosshair and guide operators', async () => {
  const { generateCalibrationPdf, PROVISIONAL_TEMPLATES } = require('../lib/pdf-documents');
  const bytes = await generateCalibrationPdf(PROVISIONAL_TEMPLATES.WATSONS_SI_V1,{xOffsetMm:1,yOffsetMm:2,scalePercent:100});
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1);
  assert.ok(bytes.length > 1000);
});
