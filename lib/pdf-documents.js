'use strict';

const { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = require('pdf-lib');
const { mmToPoints, applyCalibration } = require('./po-core');

const DEFAULT_WATERMARK = 'SAMPLE – NOT VALID FOR ISSUANCE';
const paperWidthPt = mmToPoints(140);
const paperHeightPt = mmToPoints(200);

const PROVISIONAL_TEMPLATES = Object.freeze({
  WATSONS_SI_V1: Object.freeze({
    id:'WATSONS_SI_V1',name:'MARU Sales Invoice - Calibrated',documentType:'SI',version:1,
    paperWidthMm:140,paperHeightMm:200,paperWidthPt,paperHeightPt,orientation:'PORTRAIT',printOverlayRotation:180,
    font:'Helvetica-Bold',fontSize:10.5,headerFontSize:10,addressFontSize:7.5,descriptionFontSize:6.5,itemFontSize:10.5,amountFontSize:11.5,totalsFontSize:11.5,minFontSize:6.5,maxItems:18,dateFormat:'MMMM d, yyyy',currencyFormat:'PHP',
    calibrated:true,active:true,developmentWatermark:DEFAULT_WATERMARK,
    fields:Object.freeze({
      saleType:{x:mmToPoints(46),y:mmToPoints(180)},date:{x:mmToPoints(115),y:mmToPoints(172)+0.5,maxWidth:mmToPoints(21)},
      customerName:{x:mmToPoints(41)+3,y:mmToPoints(163)+8,maxWidth:mmToPoints(92)},tin:{x:mmToPoints(20.5)+4,y:mmToPoints(160.5)+3.5,maxWidth:mmToPoints(42)},
      address:{x:mmToPoints(36)+12,y:mmToPoints(155)+9,maxWidth:mmToPoints(96),lineHeight:9,maxLines:2},poNumber:{x:mmToPoints(75),y:mmToPoints(95),fontSize:24},
      printTerms:false,calibrationRevision:13,
      quantityAlignment:'center',unitAlignment:'center',priceAlignment:'center',amountAlignment:'center',
      items:{x:mmToPoints(13.5)+0.5,y:mmToPoints(148.4)-1,rowHeight:mmToPoints(4.25),valueYOffsetPt:-1.5,descriptionWidth:mmToPoints(55.5),quantityX:mmToPoints(76)-0.5,quantityWidth:mmToPoints(13),unitX:mmToPoints(88)+3,unitWidth:mmToPoints(14),priceX:mmToPoints(103.5)-0.5,priceWidth:mmToPoints(18),amountX:mmToPoints(124)-0.5,amountWidth:mmToPoints(22)},
      printLeftVatBreakdown:false,
      vatSales:{x:mmToPoints(64),y:mmToPoints(69)},vat:{x:mmToPoints(64),y:mmToPoints(65)},
      totalsAlignment:'center',
      totalSales:{x:mmToPoints(123.5),y:mmToPoints(73)-5,maxWidth:mmToPoints(25)},lessVat:{x:mmToPoints(123.5),y:mmToPoints(69)-5,maxWidth:mmToPoints(25)},
      netOfVat:{x:mmToPoints(123.5),y:mmToPoints(64.5)-5,maxWidth:mmToPoints(25)},addVat:{x:mmToPoints(123.5),y:mmToPoints(53.5)-2.5,maxWidth:mmToPoints(25)},
      total:{x:mmToPoints(123.5),y:mmToPoints(45.5)-3.5,maxWidth:mmToPoints(25)}
    })
  }),
  WATSONS_DR_V1: Object.freeze({
    id:'WATSONS_DR_V1',name:'MARU Delivery Receipt - Calibrated',documentType:'DR',version:1,
    paperWidthMm:140,paperHeightMm:200,paperWidthPt,paperHeightPt,orientation:'PORTRAIT',printOverlayRotation:180,
    font:'Helvetica-Bold',fontSize:11,minFontSize:6.5,headerFontIncreasePt:-1,productRowFontIncreasePt:0,conversionNoteFontIncreasePt:-4.5,detailFontIncreasePt:0,poNumberFontIncreasePt:0,maxItems:20,dateFormat:'MMMM d, yyyy',currencyFormat:'PHP',
    calibrated:true,active:true,developmentWatermark:DEFAULT_WATERMARK,
    fields:Object.freeze({
      customerName:{x:mmToPoints(31.5)+7-1.5,y:mmToPoints(171)+0.5,maxWidth:mmToPoints(55)},date:{x:mmToPoints(102)+3-1.5,y:mmToPoints(171)+0.5,maxWidth:mmToPoints(32)},
      tin:{x:mmToPoints(31.5)+7-1.5,y:mmToPoints(166)+0.5,maxWidth:mmToPoints(55)},terms:{x:mmToPoints(102)+3-1.5,y:mmToPoints(166)+0.5,maxWidth:mmToPoints(32)},
      address:{x:mmToPoints(31.5)+7-1.5,y:mmToPoints(161)+0.5,maxWidth:mmToPoints(103)},poNumber:{x:mmToPoints(45.5)-2,y:0,fontSize:24},
      poAfterTotal:true,poRowOffset:3.5,poNumberAlignment:'left',totalLabelGap:mmToPoints(4),calibrationRevision:14,
      quantityAlignment:'center',unitAlignment:'center',
      items:{x:mmToPoints(45.5)-2,y:mmToPoints(148)+2,rowHeight:mmToPoints(5.7),descriptionWidth:mmToPoints(43.5),quantityX:mmToPoints(22.5)-4.5,quantityWidth:mmToPoints(13),unitX:mmToPoints(37)-1.5,unitWidth:mmToPoints(14),priceX:mmToPoints(111)-2,priceWidth:mmToPoints(20),amountX:mmToPoints(132)-2,amountWidth:mmToPoints(20)},
      remarks:{x:mmToPoints(39)-2,y:mmToPoints(137)+2,maxWidth:mmToPoints(92)}
    })
  })
});

function ascii(value) {
  return String(value == null ? '' : value).normalize('NFKD').replace(/[^\x20-\x7E]/g,'');
}
function currency(value) { return Number(value || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function normalizeSiTransaction(transaction = {}) {
  return {
    ...transaction,
    customerName: transaction.customerName || transaction.soldTo || transaction.registeredName || '',
    address: transaction.siAddress || transaction.address || transaction.businessAddress || transaction.deliveryAddress || '',
    lines: (transaction.lines || []).map(line => ({
      ...line,
      description: line.siDescription || line.invoiceDescription || line.description || line.customerDescription || ''
    }))
  };
}

const WATSONS_APPROVED_DESCRIPTIONS = Object.freeze({
  '50033566':'FLUFFY SQUARE COTTON PADS 100S 2S',
  '50033576':'FLUFFY COTTON BUDS 200 STEM 400 TIPS',
  '50033577':'FLUFFY KITCHEN TOWEL 2PLY 2 ROLLS',
  '50033580':'FLUFFY INTERFOLDED PAPER TOWEL 2PLY 150S',
  '50057440':'PLUSH BATHROOM TISSUE 3PLY 12 ROLLS WITH COTTON BUDS'
});
const WATSONS_DC3_APPROVED_ADDRESS = '93677 DC3 PAMPANGA, BJ LAND INC COMPOUND, QUEZON RD';
const WATSONS_SI_ADDRESS = '9th Floor One E-com Center, Ocean Drive, Mall of Asia Complex, CBP-IA, Barangay 76, 1300 Pasay City, NCR, Fourth District, Philippines';

function applyApprovedDocumentProfile(transaction = {}) {
  if (String(transaction.customerCode || '').trim().toUpperCase() !== 'WATSONS') return transaction;
  const deliveryAddress = transaction.deliveryAddress || transaction.address || WATSONS_DC3_APPROVED_ADDRESS;
  const lines = (transaction.lines || []).map(line => {
    const article = String(line.customerArticleNumber || '').trim();
    const approvedDescription = WATSONS_APPROVED_DESCRIPTIONS[article];
    return approvedDescription ? {...line,invoiceDescription:approvedDescription,drDescription:approvedDescription} : line;
  });
  return {
    ...transaction,
    customerName:'WATSONS PERSONAL CARE',
    deliveredTo:'WATSONS PERSONAL CARE',
    tin:transaction.tin || '214-706-591-000',
    siAddress:WATSONS_SI_ADDRESS,
    address:deliveryAddress,
    deliveryAddress,
    paymentTerms:transaction.paymentTerms || '60 Days',
    lines
  };
}

function fitValueToWidth(font,text,size,maxWidth,minFontSize = 6.5) {
  const value=ascii(text);
  let fontSize=Number(size)||7;
  if (!maxWidth || !value) return {text:value,fontSize};
  const measured=font.widthOfTextAtSize(value,fontSize);
  if (measured > maxWidth) fontSize=Math.max(minFontSize,Math.floor((fontSize*maxWidth/measured)*10)/10);
  let displayed=value;
  while (displayed.length > 1 && font.widthOfTextAtSize(displayed,fontSize) > maxWidth) displayed=displayed.slice(0,-1);
  return {text:displayed,fontSize};
}

function wrapValueToWidth(font,text,size,maxWidth,minFontSize = 6.5,maxLines = 3) {
  const value=ascii(text).replace(/\s+/g,' ').trim();
  const wrapAtSize=fontSize=>{
    const lines=[];
    for (const word of value.split(' ').filter(Boolean)) {
      const candidate=lines.length ? `${lines[lines.length-1]} ${word}` : word;
      if (lines.length && font.widthOfTextAtSize(candidate,fontSize)>maxWidth) lines.push(word);
      else if (lines.length) lines[lines.length-1]=candidate;
      else lines.push(word);
    }
    return lines;
  };
  for(let fontSize=Number(size)||7;fontSize>=minFontSize;fontSize=Math.round((fontSize-0.25)*100)/100){
    const lines=wrapAtSize(fontSize);
    if(lines.length<=maxLines && lines.every(line=>font.widthOfTextAtSize(line,fontSize)<=maxWidth)) return {lines,fontSize};
  }
  const fontSize=minFontSize,lines=wrapAtSize(fontSize);
  return {lines,fontSize};
}

function drawValue(page,font,text,field,calibration,size,options = {}) {
  if (!field || text === '' || text == null) return;
  const point = applyCalibration(field,calibration);
  const scale = (Number(calibration && calibration.scalePercent) || 100) / 100;
  const requestedFontSize = (field.fontSize || size) * scale;
  const value = ascii(text);
  const maxWidth = (field.maxWidth || options.maxWidth || 0) * scale;
  const fitted=fitValueToWidth(font,value,requestedFontSize,maxWidth,(field.minFontSize||options.minFontSize||6.5)*scale);
  const displayed=fitted.text,fontSize=fitted.fontSize;
  let x = point.x;
  if (options.align === 'right') x -= font.widthOfTextAtSize(displayed,fontSize);
  if (options.align === 'center') x -= font.widthOfTextAtSize(displayed,fontSize)/2;
  page.drawText(displayed,{x,y:point.y,size:fontSize,font,color:rgb(0,0,0)});
}

async function preparePage(template) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([template.paperWidthPt,template.paperHeightPt]);
  return {pdf,page};
}

function drawProvisionalFormBackground(page,font,template) {
  const ink=rgb(0.72,0.72,0.72);
  const label=template.documentType==='SI'?'SALES INVOICE (PROVISIONAL BACKGROUND)':'DELIVERY RECEIPT (PROVISIONAL BACKGROUND)';
  page.drawText(label,{x:mmToPoints(8),y:template.paperHeightPt-mmToPoints(12),size:9,font,color:ink});
  page.drawRectangle({x:mmToPoints(6),y:mmToPoints(12),width:template.paperWidthPt-mmToPoints(12),height:template.paperHeightPt-mmToPoints(28),borderColor:ink,borderWidth:0.5});
  const start=template.documentType==='SI'?mmToPoints(145):mmToPoints(150);
  for(let row=0;row<12;row+=1){
    const y=start-row*mmToPoints(9);
    page.drawLine({start:{x:mmToPoints(7),y},end:{x:template.paperWidthPt-mmToPoints(7),y},thickness:0.35,color:ink});
  }
  page.drawText('This recreated background is for checking placement only.',{x:mmToPoints(8),y:mmToPoints(7),size:5,font,color:ink});
}

function drawWatermark(page,font,template) {
  const label = 'SAMPLE - NOT VALID FOR ISSUANCE';
  page.drawText(label,{x:mmToPoints(13),y:template.paperHeightPt/2,size:19,font,color:rgb(0.8,0.08,0.08),opacity:0.34,rotate:degrees(36)});
}

function drawSi(page,fonts,template,calibration,transaction) {
  transaction = normalizeSiTransaction(transaction);
  const {regular,bold}=fonts;
  const fields = template.fields;
  const headerFontSize=Number(template.headerFontSize)||template.fontSize;
  const addressFontSize=Number(template.addressFontSize)||headerFontSize;
  const descriptionFontSize=Number(template.descriptionFontSize)||template.fontSize;
  const itemFontSize=Number(template.itemFontSize)||template.fontSize;
  const amountFontSize=Number(template.amountFontSize)||template.fontSize;
  const totalsFontSize=Number(template.totalsFontSize)||template.fontSize;
  drawValue(page,bold,String(transaction.saleType || 'CHARGE SALES').toUpperCase().includes('CHARGE') ? 'X' : '',fields.saleType,calibration,template.fontSize + 2);
  drawValue(page,bold,transaction.date,fields.date,calibration,headerFontSize);
  drawValue(page,bold,transaction.customerName,fields.customerName,calibration,headerFontSize);
  drawValue(page,bold,transaction.tin,fields.tin,calibration,headerFontSize);
  const addressWrap=wrapValueToWidth(bold,transaction.address,addressFontSize,fields.address.maxWidth,template.minFontSize,fields.address.maxLines||2);
  addressWrap.lines.forEach((text,index)=>drawValue(page,bold,text,{...fields.address,y:fields.address.y-(fields.address.lineHeight||9)*index},calibration,addressWrap.fontSize));
  drawValue(page,bold,transaction.poNumber ? `PO #: ${transaction.poNumber}` : '',fields.poNumber,calibration,template.fontSize,{align:'center'});
  if (fields.printTerms) drawValue(page,bold,transaction.paymentTerms,fields.terms,calibration,headerFontSize);
  let rowIndex=0;
  (transaction.lines || []).slice(0,template.maxItems).forEach(line => {
    const description=fitValueToWidth(regular,line.description,descriptionFontSize,fields.items.descriptionWidth,template.minFontSize);
    const firstY=fields.items.y-fields.items.rowHeight*rowIndex;
    const valueY=firstY+(Number(fields.items.valueYOffsetPt)||0);
    drawValue(page,regular,description.text,{x:fields.items.x,y:firstY,maxWidth:fields.items.descriptionWidth,minFontSize:template.minFontSize},calibration,description.fontSize);
    drawValue(page,regular,line.poQuantity,{x:fields.items.quantityX,y:valueY,maxWidth:fields.items.quantityWidth},calibration,itemFontSize,{align:fields.quantityAlignment});
    drawValue(page,regular,line.poUnit,{x:fields.items.unitX,y:valueY,maxWidth:fields.items.unitWidth},calibration,itemFontSize,{align:fields.unitAlignment});
    drawValue(page,regular,currency(line.sellingPrice != null ? line.sellingPrice : line.unitPrice),{x:fields.items.priceX,y:valueY,maxWidth:fields.items.priceWidth},calibration,itemFontSize,{align:fields.priceAlignment});
    drawValue(page,bold,currency(line.calculatedAmount != null ? line.calculatedAmount : line.lineAmount),{x:fields.items.amountX,y:valueY,maxWidth:fields.items.amountWidth},calibration,amountFontSize,{align:fields.amountAlignment});
    rowIndex+=1;
  });
  const totals = transaction.totals || {};
  if(fields.printLeftVatBreakdown){
    drawValue(page,bold,currency(totals.netOfVat),fields.vatSales,calibration,template.fontSize,{align:'right'});
    drawValue(page,bold,currency(totals.vat),fields.vat,calibration,template.fontSize,{align:'right'});
  }
  drawValue(page,bold,currency(totals.gross),fields.totalSales,calibration,totalsFontSize,{align:fields.totalsAlignment});
  drawValue(page,bold,currency(totals.vat),fields.lessVat,calibration,totalsFontSize,{align:fields.totalsAlignment});
  drawValue(page,bold,currency(totals.netOfVat),fields.netOfVat,calibration,totalsFontSize,{align:fields.totalsAlignment});
  drawValue(page,bold,currency(totals.vat),fields.addVat,calibration,totalsFontSize,{align:fields.totalsAlignment});
  drawValue(page,bold,currency(totals.gross),fields.total,calibration,totalsFontSize,{align:fields.totalsAlignment});
}

function drawDr(page,fonts,template,calibration,transaction) {
  const {regular,bold}=fonts;
  const fields = template.fields;
  const headerFontSize=template.fontSize+(Number(template.headerFontIncreasePt)||0);
  const productRowFontSize=template.fontSize+(Number(template.productRowFontIncreasePt)||0);
  const conversionNoteFontSize=template.fontSize+(Number(template.conversionNoteFontIncreasePt)||0);
  const detailFontSize=template.fontSize+(Number(template.detailFontIncreasePt)||0);
  drawValue(page,bold,transaction.deliveredTo || transaction.customerName,fields.customerName,calibration,headerFontSize);
  drawValue(page,bold,transaction.date,fields.date,calibration,headerFontSize);
  drawValue(page,bold,transaction.tin,fields.tin,calibration,headerFontSize);
  drawValue(page,bold,transaction.paymentTerms,fields.terms,calibration,headerFontSize);
  drawValue(page,bold,transaction.deliveryAddress || transaction.address,fields.address,calibration,headerFontSize);
  let rowIndex=0;
  (transaction.lines || []).slice(0,template.maxItems).forEach(line => {
    const y = fields.items.y - fields.items.rowHeight * rowIndex;
    const description=line.drDescription || line.description || line.customerDescription;
    const wrapped=wrapValueToWidth(regular,description,productRowFontSize,fields.items.descriptionWidth,template.minFontSize,3);
    drawValue(page,regular,line.poQuantity,{x:fields.items.quantityX,y,maxWidth:fields.items.quantityWidth},calibration,productRowFontSize,{align:fields.quantityAlignment});
    drawValue(page,regular,'CASE',{x:fields.items.unitX,y,maxWidth:fields.items.unitWidth},calibration,productRowFontSize,{align:fields.unitAlignment});
    wrapped.lines.forEach((text,lineIndex)=>drawValue(page,regular,text,{x:fields.items.x,y:y-fields.items.rowHeight*lineIndex},calibration,wrapped.fontSize));
    drawValue(page,regular,currency(line.sellingPrice != null ? line.sellingPrice : line.unitPrice),{x:fields.items.priceX,y,maxWidth:fields.items.priceWidth},calibration,productRowFontSize,{align:'right'});
    drawValue(page,bold,currency(line.calculatedAmount != null ? line.calculatedAmount : line.lineAmount),{x:fields.items.amountX,y,maxWidth:fields.items.amountWidth},calibration,productRowFontSize,{align:'right'});
    rowIndex += Math.max(1,wrapped.lines.length);
    const descriptionUpper=String(description || '').toUpperCase();
    if(descriptionUpper.includes('COTTON PADS') && Number(line.packsPerPoCase)===144 && Number(line.packsPerPhysicalCarton)===72){
      const packs=Number(line.poQuantity || 0)*144;
      const cartons=Number(line.physicalCartons || packs/72);
      const notes=[`1 PO CASE = 144 PACKS; 1 PHYSICAL CARTON = 72 PACKS`,`PO QTY ${line.poQuantity} = ${packs} PACKS = ${cartons} PHYSICAL CARTONS`];
      const priceText=currency(line.sellingPrice != null ? line.sellingPrice : line.unitPrice);
      const priceTextLeft=fields.items.priceX-regular.widthOfTextAtSize(priceText,productRowFontSize);
      const reminderMaxWidth=Math.max(0,priceTextLeft-fields.items.x-4);
      notes.forEach(note=>{
        const wrappedNote=wrapValueToWidth(regular,note,conversionNoteFontSize,reminderMaxWidth,conversionNoteFontSize,2);
        wrappedNote.lines.forEach(line=>{
          const noteY=fields.items.y-fields.items.rowHeight*rowIndex;
          drawValue(page,regular,line,{x:fields.items.x,y:noteY,maxWidth:reminderMaxWidth},calibration,wrappedNote.fontSize);
          rowIndex += 1;
        });
      });
    }
  });
  const totalY=fields.items.y-fields.items.rowHeight*(rowIndex+1);
  drawValue(page,bold,'TOTAL',{x:fields.items.priceX-fields.totalLabelGap,y:totalY},calibration,detailFontSize,{align:'right'});
  drawValue(page,bold,currency((transaction.totals || {}).gross),{x:fields.items.amountX,y:totalY},calibration,detailFontSize+1,{align:'right'});
  const poY=fields.items.y-fields.items.rowHeight*(rowIndex+fields.poRowOffset);
  drawValue(page,bold,transaction.poNumber ? `PO #: ${transaction.poNumber}` : '',{...fields.poNumber,y:poY,fontSize:(fields.poNumber.fontSize||template.fontSize)+(Number(template.poNumberFontIncreasePt)||0)},calibration,detailFontSize,{align:fields.poNumberAlignment||'center'});
  drawValue(page,regular,transaction.remarks,fields.remarks,calibration,detailFontSize-1);
}

async function generateDocumentPdf({type,variant,template,calibration = {},transaction,backgroundPdfBytes}) {
  if (!['SI','DR'].includes(type)) throw new Error('Document type must be SI or DR.');
  if (!['PREVIEW','OVERLAY'].includes(variant)) throw new Error('Document variant must be PREVIEW or OVERLAY.');
  if (!template || template.documentType !== type) throw new Error('Template does not match document type.');
  // PREVIEW and OVERLAY intentionally share the exact same calibrated value layer.
  // Scanned forms are physical alignment references only and are never embedded.
  void backgroundPdfBytes;
  const {pdf,page} = await preparePage(template);
  const fonts = {
    regular:await pdf.embedFont(StandardFonts.Helvetica),
    bold:await pdf.embedFont(StandardFonts.HelveticaBold)
  };
  const rotatePrintOverlay = variant === 'OVERLAY' && Number(template.printOverlayRotation) === 180;
  if (rotatePrintOverlay) {
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(-1,0,0,-1,template.paperWidthPt,template.paperHeightPt)
    );
  }
  const approvedTransaction = applyApprovedDocumentProfile(transaction || {});
  if (type === 'SI') drawSi(page,fonts,template,calibration,normalizeSiTransaction(approvedTransaction));
  else drawDr(page,fonts,template,calibration,approvedTransaction);
  if (!template.calibrated) drawWatermark(page,fonts.bold,template);
  if (rotatePrintOverlay) page.pushOperators(popGraphicsState());
  pdf.setTitle(variant === 'PREVIEW' ? `${type} PREVIEW - VALUES ONLY` : `${type} OVERLAY`);
  pdf.setSubject(variant === 'PREVIEW' ? 'Plain white values-only preview; not saved or issued' : `${type} print overlay`);
  return pdf.save({useObjectStreams:false});
}

async function generateCalibrationPdf(template,calibration = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([template.paperWidthPt,template.paperHeightPt]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const center = applyCalibration({x:template.paperWidthPt/2,y:template.paperHeightPt/2},calibration);
  const color = rgb(0,0,0);
  page.drawLine({start:{x:center.x-mmToPoints(15),y:center.y},end:{x:center.x+mmToPoints(15),y:center.y},thickness:0.5,color});
  page.drawLine({start:{x:center.x,y:center.y-mmToPoints(15)},end:{x:center.x,y:center.y+mmToPoints(15)},thickness:0.5,color});
  for (let mm = 10; mm < template.paperWidthMm; mm += 10) {
    const x = applyCalibration({x:mmToPoints(mm),y:0},calibration).x;
    page.drawLine({start:{x,y:0},end:{x,y:mmToPoints(mm % 50 === 0 ? 5 : 2)},thickness:0.35,color});
    if (mm % 20 === 0) page.drawText(`${mm}mm`,{x:x-6,y:mmToPoints(6),size:5,font,color});
  }
  for (let mm = 10; mm < template.paperHeightMm; mm += 10) {
    const y = applyCalibration({x:0,y:mmToPoints(mm)},calibration).y;
    page.drawLine({start:{x:0,y},end:{x:mmToPoints(mm % 50 === 0 ? 5 : 2),y},thickness:0.35,color});
  }
  page.drawText('CALIBRATION TEST - PRINT ACTUAL SIZE 100% - DO NOT FIT',{x:mmToPoints(10),y:template.paperHeightPt-mmToPoints(12),size:8,font,color});
  drawWatermark(page,font,template);
  return pdf.save({useObjectStreams:false});
}

module.exports = {DEFAULT_WATERMARK,PROVISIONAL_TEMPLATES,normalizeSiTransaction,applyApprovedDocumentProfile,fitValueToWidth,wrapValueToWidth,drawSi,drawDr,generateDocumentPdf,generateCalibrationPdf};
