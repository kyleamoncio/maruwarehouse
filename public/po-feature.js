(function warehousePoFeature(){
'use strict';
const Core=window.WarehousePOCore;
const Entry=window.WarehousePOEntry;
const API='/api/po';
const state={initialized:false,user:null,bootstrap:{mappings:[]},transactions:[],summaryDocuments:[],file:null,fileBuffer:null,objectUrl:'',draftPreviewUrls:{SI:'',DR:''},draftPdfPromises:{},extracted:null,calculated:null,currentPoId:'',currentTransaction:null,documents:null,status:'Not uploaded',busy:false,orderSaved:false,documentsCommitted:false};
const $=id=>document.getElementById(id);
const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=value=>Number(value)||0;
const money=value=>Math.round((num(value)+Number.EPSILON)*100)/100;
const normalize=value=>Core.normalize(value);
const fileUrl=(fileId,download=false)=>`/api/po/file?fileId=${encodeURIComponent(fileId)}${download?'&download=1':''}`;

async function request(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const type=response.headers.get('content-type')||'';
  const result=type.includes('application/json')?await response.json():null;
  if(!response.ok||!result||result.success===false){
    const error=new Error((result&&result.error)||`Request failed (${response.status}).`);
    if(response.status===401)error.code='AUTH';
    if(result&&result.duplicate)error.duplicate=result;
    throw error;
  }
  return result;
}
function setStatus(label,message=''){
  state.status=label;
  const badge=$('poDocumentState');
  if(badge){badge.textContent=label;badge.className=`po-state is-${label.toLowerCase().replace(/[^a-z]+/g,'-')}`;}
  if($('poUploadMessage'))$('poUploadMessage').textContent=message;
  syncActions();
}
function setProgress(percent,show=true){
  const host=$('poProgress');if(!host)return;host.hidden=!show;const bar=host.querySelector('span');if(bar)bar.style.width=`${Math.max(0,Math.min(100,percent))}%`;
}
function showError(error){
  const message=error&&error.message?error.message:String(error||'Unknown error.');
  setStatus('Failed',message);setProgress(0,false);
  if(window.showToast)showToast(message,'error');
}
function latestDocs(transaction=state.currentTransaction){return Entry.currentDocuments(transaction||{});}
function syncActions(){
  const hasDraft=Boolean(state.currentPoId&&state.calculated),hasOriginal=Boolean(state.objectUrl||(state.currentTransaction&&state.currentTransaction.poFile));
  const docs=latestDocs();
  if($('poViewButton'))$('poViewButton').disabled=!hasOriginal;
  if($('poPreviewButton'))$('poPreviewButton').disabled=!hasDraft&&!(docs.siPreview||docs.drPreview);
  if($('poDownloadSi'))$('poDownloadSi').disabled=!hasDraft&&!docs.siOverlay;
  if($('poDownloadDr'))$('poDownloadDr').disabled=!hasDraft&&!docs.drOverlay;
  const submit=$('entrySubmitButton');
  if(submit&&state.currentPoId){
    submit.disabled=state.busy||state.documentsCommitted;
    submit.innerHTML=state.documentsCommitted?'✓ Order & Documents Saved':state.busy?'Saving…':state.orderSaved?'Retry Document Save':'✓ Confirm and Save Order';
  }
}
async function init(){
  if(state.initialized){syncActions();return;}
  state.initialized=true;
  $('poFileInput')?.addEventListener('change',event=>{const file=event.target.files&&event.target.files[0];if(file)selectFile(file);});
  $('entryLines')?.addEventListener('input',()=>{if(state.currentPoId)markNeedsReview();});
  $('entryLines')?.addEventListener('change',event=>{if(event.target.classList.contains('entry-product')&&state.currentPoId)reviewProductSelection(event.target.closest('[data-entry-line]'));});
  try{await loadBootstrap();setStatus('Not uploaded','');}catch(error){showError(error);}
}
async function loadBootstrap(){const result=await request('/api/po/mappings');state.bootstrap=result;}
async function refreshTransactions(){
  const result=await request('/api/sheets?action=getSummaryDocuments');
  const source=result.summaryDocuments||result.documents||result.data||result.rows||[];
  const values=Array.isArray(source)?source:Object.values(source||{});
  state.summaryDocuments=values.filter(item=>item&&typeof item==='object').map(item=>({...item.identity,...item.summary,...item}));
  return state.summaryDocuments;
}
function newPo(){
  if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);
  Object.values(state.draftPreviewUrls||{}).filter(Boolean).forEach(url=>URL.revokeObjectURL(url));
  Object.assign(state,{file:null,fileBuffer:null,objectUrl:'',draftPreviewUrls:{SI:'',DR:''},draftPdfPromises:{},extracted:null,calculated:null,currentPoId:'',currentTransaction:null,documents:null,status:'Not uploaded',busy:false,orderSaved:false,documentsCommitted:false});
  if($('poFileInput'))$('poFileInput').value='';
  if($('poSelectedFilename'))$('poSelectedFilename').textContent='No PDF selected.';
  document.querySelectorAll('.po-order-field').forEach(el=>el.classList.remove('is-active'));
  getEntryLines().forEach((line,index)=>{if(index>0)line.remove();else clearPoSource(line);});
  setStatus('Not uploaded','');setProgress(0,false);syncActions();
}
async function loadPdfJs(){
  if(window.pdfjsLib)return window.pdfjsLib;
  const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  return pdfjs;
}
function tableText(items){
  const rows=[];
  items.forEach(item=>{const y=Math.round((item.transform&&item.transform[5]||0)/2)*2;let row=rows.find(candidate=>Math.abs(candidate.y-y)<=2);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x:item.transform&&item.transform[4]||0,text:item.str||''});});
  return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join('  ')).join('\n');
}
async function extractTextCandidates(buffer,progress){
  const pdfjs=await loadPdfJs();
  const pdf=await pdfjs.getDocument({data:new Uint8Array(buffer.slice(0))}).promise;
  const flow=[],tables=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber+=1){
    const page=await pdf.getPage(pageNumber),content=await page.getTextContent();
    flow.push(content.items.map(item=>item.str).join('\n'));tables.push(tableText(content.items));progress(15+Math.round(pageNumber/pdf.numPages*38));
  }
  return{pdf,flowText:flow.join('\n\f\n'),tableText:tables.join('\n\f\n')};
}
async function ocrPdf(pdf,progress){
  if(!window.Tesseract)throw new Error('This PDF has no usable text. OCR could not start; check the internet connection and retry.');
  const pages=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber+=1){
    const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale:2});
    const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const result=await window.Tesseract.recognize(canvas,'eng',{logger:event=>{if(event.status==='recognizing text')progress(52+Math.round(((pageNumber-1+event.progress)/pdf.numPages)*25));}});
    pages.push(result.data.text||'');
  }
  return pages.join('\n\f\n');
}
async function extractPo(file,buffer){
  const candidates=await extractTextCandidates(buffer,value=>setProgress(value));
  const usable=candidates.flowText.replace(/\s+/g,' ').trim().length>=80;
  const texts=usable?[candidates.flowText,candidates.tableText]:[await ocrPdf(candidates.pdf,value=>setProgress(value))];
  let lastError;
  for(const text of texts){
    try{const parsed=Core.parsePurchaseOrder(text,{sourceFilename:file.name});const valid=Core.validateExtractedPo(parsed);if(valid.success)return parsed;lastError=new Error(valid.issues.map(issue=>issue.message).join(' '));}catch(error){lastError=error;}
  }
  throw lastError||new Error('The PO could not be extracted.');
}
async function selectFile(file){
  if(state.busy)return;
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))return showError(new Error('Please choose a PDF file only.'));
  if(file.size>3*1024*1024)return showError(new Error('The PDF must be 3 MB or smaller.'));
  newPo();state.busy=true;state.file=file;$('poSelectedFilename').textContent=file.name;
  try{
    setStatus('Uploading','Reading the selected PDF…');setProgress(5);
    const buffer=await file.arrayBuffer();state.fileBuffer=buffer;state.objectUrl=URL.createObjectURL(file);
    setStatus('Extracting','Reading PO details and line items…');setProgress(12);
    const extracted=await extractPo(file,buffer);state.extracted=extracted;
    state.calculated=Core.applyMappingsAndCalculate(extracted,state.bootstrap.mappings||[]);setProgress(72);
    populateNewEntry(state.calculated);setProgress(78);
    state.currentPoId=`draft-${Date.now()}`;
    state.currentTransaction={id:state.currentPoId,poNumber:state.extracted.poNumber,customerCode:state.extracted.customerCode,customerName:state.extracted.customerName,branch:state.extracted.branch,documents:[],files:[]};
    const draft=collectReviewed(),errors=validateReview(draft.reviewed,draft.calculated);
    setStatus(errors.length?'Needs review':'Ready to preview',errors.length?'Check the highlighted PO fields and every product. Preview becomes available after resolving them.':'Extraction is complete. Review the products, cases, packs, prices, and exact total; Preview SI/DR is ready.');setProgress(100);
    if(!errors.length)window.setTimeout(prefetchDraftPdfs,0);
    window.setTimeout(()=>setProgress(0,false),700);
  }catch(error){showError(error);}finally{state.busy=false;syncActions();}
}
function getEntryLines(){return Array.from(document.querySelectorAll('[data-entry-line]'));}
function ensureEntryLineCount(count){
  const needed=Math.max(1,count);
  while(getEntryLines().length<needed)window.addEntryLine();
  getEntryLines().slice(needed).forEach(line=>line.remove());
  if(window.renumberEntryLines)renumberEntryLines();
}
function setValue(id,value){const el=$(id);if(el)el.value=value==null?'':value;}
function selectExistingProduct(select,value){
  const options=Array.from(select.options).filter(item=>item.value);const resolved=Entry.resolvePortalProductName(value,options.map(item=>item.value));
  const option=options.find(item=>item.value===resolved)||options.find(item=>normalize(item.value)===normalize(value)||normalize(item.textContent)===normalize(value));
  select.value=option?option.value:'';return Boolean(option);
}
function clearPoSource(line){
  line.classList.remove('po-needs-review','po-matched');line.removeAttribute('data-po-source-index');line.removeAttribute('data-po-rounding-adjustment');
  const price=line.querySelector('.entry-price');if(price)price.step='0.01';
  const source=line.querySelector('.entry-po-source');if(source)source.hidden=true;
}
function populateNewEntry(calculated){
  const draft=Entry.buildEntryDraft(calculated,{documentDate:calculated.poDate||Entry.manilaDateIso()});
  setValue('e-po',draft.order.poNumber);setValue('e-si','');setValue('e-date',draft.order.documentDate);
  const buyer=$('e-buyer');if(buyer){if(!Array.from(buyer.options).some(option=>option.value===draft.order.buyer)){const option=document.createElement('option');option.value=draft.order.buyer;option.textContent=draft.order.buyer;buyer.append(option);}buyer.value=draft.order.buyer;}
  ensureEntryLineCount(draft.lines.length);
  getEntryLines().forEach((line,index)=>fillEntryLine(line,draft.lines[index]));
  if(window.updatePreview)updatePreview();
  const submit=$('entrySubmitButton');if(submit)submit.innerHTML='✓ Confirm and Save Order';
}
function fillEntryLine(line,draft){
  if(!draft)return;
  line.dataset.poSourceIndex=String(draft.sourceIndex);
  const product=line.querySelector('.entry-product'),matched=selectExistingProduct(product,draft.product);
  line.querySelector('.entry-cases').value=draft.cases||'';line.querySelector('.entry-packs').value=draft.packs||'';
  const priceInput=line.querySelector('.entry-price');priceInput.value=draft.price||'';priceInput.step='0.000000001';line.dataset.poRoundingAdjustment=String(draft.roundingAdjustment||0);
  const needsReview=draft.needsReview||!matched;line.classList.toggle('po-needs-review',needsReview);line.classList.toggle('po-matched',!needsReview);
  line.dataset.mappingId=draft.mappingId||'';
  const priceLabel=line.querySelector('.entry-price-label');if(priceLabel)priceLabel.textContent='Price per Pack (₱)';
  if(line.querySelector('.entry-price-hint'))line.querySelector('.entry-price-hint').textContent=matched?(draft.roundingAdjustment?`Filled from the uploaded PO; includes the SM header rounding adjustment of ${money(draft.roundingAdjustment).toFixed(2)}.`:'Filled from the uploaded PO.'):'Select the correct product to calculate cases and packs.';
}
function reviewProductSelection(line){
  if(!line)return false;
  const product=line.querySelector('.entry-product').value,productKey=Entry.productTokenKey(product);
  const mapping=(state.bootstrap.mappings||[]).find(item=>Entry.customerFamily(item.customerCode)===Entry.customerFamily(state.calculated&&state.calculated.customerCode)&&Entry.productTokenKey(item.internalProductName)===productKey);
  line.dataset.mappingId=mapping?mapping.id:'';const needs=!mapping;
  line.classList.toggle('po-needs-review',needs);line.classList.toggle('po-matched',!needs);
  if(mapping){
    const original=(state.extracted.lines||[])[Number(line.dataset.poSourceIndex)]||{},qty=num(original.poQuantity),unit=normalize(original.poUnit);
    const packs=unit==='CASE'?qty*num(mapping.packsPerPoCase):qty,cartons=num(mapping.packsPerPhysicalCarton)?packs/num(mapping.packsPerPhysicalCarton):0,amount=num(original.lineAmount||original.poLineAmount);
    line.querySelector('.entry-packs').value=packs||'';line.querySelector('.entry-cases').value=cartons||'';line.querySelector('.entry-price').value=packs?Math.round((amount/packs+Number.EPSILON)*1000000)/1000000:'';
  }
  if(window.updatePreview)updatePreview();markNeedsReview();return true;
}
function clearDraftPreviews(){
  Object.values(state.draftPreviewUrls||{}).filter(Boolean).forEach(url=>URL.revokeObjectURL(url));
  state.draftPreviewUrls={SI:'',DR:''};
  state.draftPdfPromises={};
}
let draftPrefetchTimer=0;
function scheduleDraftPrefetch(){
  window.clearTimeout(draftPrefetchTimer);
  draftPrefetchTimer=window.setTimeout(()=>{
    if(!state.currentPoId||!state.extracted)return;
    const {reviewed,calculated}=collectReviewed();
    if(validateReview(reviewed,calculated).length)return;
    setStatus('Ready to preview','Updated PDFs are being prepared in the background.');
    prefetchDraftPdfs();
  },350);
}
function markNeedsReview(){if(state.currentPoId&&!state.orderSaved){clearDraftPreviews();setStatus('Needs review','Review the extracted details. Preview SI/DR will validate the products and exact total without saving the order.');scheduleDraftPrefetch();}}
function selectedMapping(line){
  const id=line.dataset.mappingId;if(id)return(state.bootstrap.mappings||[]).find(mapping=>String(mapping.id)===String(id));
  const productKey=Entry.productTokenKey(line.querySelector('.entry-product').value);
  return(state.bootstrap.mappings||[]).find(mapping=>Entry.customerFamily(mapping.customerCode)===Entry.customerFamily(state.extracted.customerCode)&&Entry.productTokenKey(mapping.internalProductName)===productKey);
}
function collectReviewed(){
  const base={...state.extracted,poNumber:$('e-po').value.trim(),siNumber:$('e-si').value.trim(),documentDate:$('e-date').value};
  const lines=getEntryLines().map((line,index)=>{
    const mapping=selectedMapping(line),original=(state.extracted.lines||[])[Number(line.dataset.poSourceIndex)]||{};
    return{...original,mappingId:mapping&&mapping.id||'',portalProduct:line.querySelector('.entry-product').value,reviewedPacks:num(line.querySelector('.entry-packs').value),reviewedCases:num(line.querySelector('.entry-cases').value),reviewedPackPrice:num(line.querySelector('.entry-price').value),roundingAdjustment:num(line.dataset.poRoundingAdjustment),_line:index};
  });
  const reviewed={...base,lines},calculated=Core.applyMappingsAndCalculate(reviewed,state.bootstrap.mappings||[]);
  calculated.lines=calculated.lines.map((line,index)=>({...line,sellingQuantity:lines[index].reviewedPacks,physicalCartons:lines[index].reviewedCases,effectivePackPrice:lines[index].reviewedPackPrice,calculatedAmount:Entry.entryLineAmount({packs:lines[index].reviewedPacks,cases:lines[index].reviewedCases,price:lines[index].reviewedPackPrice,poWorkflow:true}),poLineAmount:lines[index].lineAmount}));
  calculated.totals=Core.calculateTotals(calculated.lines,calculated.poTotal,Entry.poTotalTolerance(calculated.customerCode));
  return{reviewed,calculated};
}
function validateReview(reviewed,calculated){
  const errors=[];
  if(!$('e-date').value)errors.push('Order date is required.');
  if(!$('e-buyer').value)errors.push('Customer branch is required.');
  reviewed.lines.forEach((line,index)=>{
    const n=index+1;if(!line.mappingId||!line.portalProduct)errors.push(`Product ${n} still needs a product match.`);
    if(!(line.poQuantity>0))errors.push(`Product ${n} needs a PO quantity.`);
    if(!(line.lineAmount>0))errors.push(`Product ${n} needs its official PO amount.`);
    if(!(line.reviewedPacks>0)||!(line.reviewedCases>0))errors.push(`Product ${n} needs valid pack and physical-carton quantities.`);
    if(!(line.reviewedPackPrice>0))errors.push(`Product ${n} needs an approved selling price.`);
  });
  const generation=Core.validateForGeneration(calculated);generation.errors.forEach(error=>errors.push(error.message));
  if(!calculated.totals.poMatches)errors.push(`The reviewed lines differ from the PO total by ₱${Math.abs(calculated.totals.poDifference).toFixed(2)}.`);
  return[...new Set(errors)];
}
async function confirmAndSave(){
  if(state.busy||!state.currentPoId)return;
  const {reviewed,calculated}=collectReviewed(),errors=validateReview(reviewed,calculated);
  if(errors.length){showError(new Error(errors.join(' ')));return;}
  state.busy=true;syncActions();
  try{
    if(!state.orderSaved){
      const saved=await window.submitEntry({poWorkflow:true,preserveForm:true});
      if(!saved||saved.success===false)throw new Error(saved&&saved.error||'The order could not be saved.');
      state.orderSaved=true;
    }
    setStatus('Uploading','Order lines saved. Persisting the original PO and SI/DR previews…');
    const bytes=new Uint8Array(state.fileBuffer),chunks=[];
    for(let offset=0;offset<bytes.length;offset+=0x8000)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+0x8000)));
    const committed=await request('/api/po/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:state.file&&state.file.name,mimeType:'application/pdf',originalPdfBase64:btoa(chunks.join('')),reviewed,calculated,buyer:$('e-buyer').value})});
    state.documentsCommitted=true;state.documents=committed.documents;
    await refreshTransactions().catch(()=>state.summaryDocuments);
    setStatus('Ready to download','Order saved. Original PO, SI preview, and DR preview links are now durable in SUMMARY.');
    if(window.renderSummary)window.renderSummary();
  }catch(error){
    if(state.orderSaved&&!String(error&&error.message||'').toLowerCase().includes('order lines were saved'))error=new Error(`Order lines were saved, but document links were not committed: ${error.message||error}`);
    showError(error);
  }finally{state.busy=false;syncActions();}
}
async function generate(poId=state.currentPoId){
  if(!poId)throw new Error('No PO transaction is selected.');
  const result=await request('/api/po/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({poId})});
  await refreshTransactions();if(poId===state.currentPoId)state.currentTransaction=state.transactions.find(tx=>tx.id===poId)||state.currentTransaction;
  return result;
}
async function regenerate(poId){
  try{setStatus('Ready to preview','Regenerating the missing SI and DR documents…');await generate(poId);setStatus('Ready to download','Documents regenerated and earlier versions preserved.');if(window.renderSummary)renderSummary();}catch(error){showError(error);}
}
async function detailedTransaction(transaction){
  if(!transaction)return null;
  if(Array.isArray(transaction.files))return transaction;
  const result=await request(`${API}?mode=detail&poId=${encodeURIComponent(transaction.id)}`);
  const detailed=result.transaction||transaction;
  state.transactions=state.transactions.map(item=>item.id===detailed.id?{...item,...detailed}:item);
  return detailed;
}
async function openModal(transaction,type='SI'){
  state.currentTransaction=await detailedTransaction(transaction||state.currentTransaction);const modal=$('poDocumentModal');if(!modal||!state.currentTransaction)return;
  modal.hidden=false;document.body.classList.add('po-modal-open');
  $('poDocumentModalTitle').textContent=`PO ${state.currentTransaction.poNumber||''} Documents`;$('poDocumentModalMeta').textContent=`${state.currentTransaction.customerName||state.currentTransaction.customerCode||''} · ${state.currentTransaction.branch||''}`;
  renderDocumentList(state.currentTransaction);switchPreview(type);
}
function closeModal(){$('poDocumentModal').hidden=true;$('poDocumentFrame').src='about:blank';document.body.classList.remove('po-modal-open');}
function draftPdfKey(type,variant){return`${String(type).toUpperCase()}_${String(variant).toUpperCase()}`;}
async function draftPdfBlob(type,variant='PREVIEW'){
  const key=draftPdfKey(type,variant);
  if(state.draftPdfPromises[key])return state.draftPdfPromises[key];
  const {reviewed,calculated}=collectReviewed(),errors=validateReview(reviewed,calculated);
  if(errors.length)throw new Error(errors.join(' '));
  const promise=(async()=>{
    const response=await fetch('/api/po/preview',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,variant,reviewed,calculated})});
    if(!response.ok){const result=await response.json().catch(()=>null);throw new Error(result&&result.error||`${type} ${variant.toLowerCase()} failed (${response.status}).`);}
    return response.blob();
  })();
  state.draftPdfPromises[key]=promise;
  promise.catch(()=>{if(state.draftPdfPromises[key]===promise)delete state.draftPdfPromises[key];});
  return promise;
}
function prefetchDraftPdfs(){
  if(!state.currentPoId||!state.extracted)return;
  const {reviewed,calculated}=collectReviewed();
  if(validateReview(reviewed,calculated).length)return;
  for(const type of ['SI','DR'])for(const variant of ['PREVIEW','OVERLAY'])void draftPdfBlob(type,variant).catch(()=>{});
}
async function draftPreviewUrl(type){
  if(state.draftPreviewUrls[type])return state.draftPreviewUrls[type];
  const url=URL.createObjectURL(await draftPdfBlob(type,'PREVIEW'));state.draftPreviewUrls[type]=url;return url;
}
function setPreviewBusy(type,busy){
  const buttons=[$('poPreviewButton'),$(type==='DR'?'poModalDrTab':'poModalSiTab')].filter(Boolean);
  buttons.forEach(button=>{
    if(busy){if(!button.dataset.idleHtml)button.dataset.idleHtml=button.innerHTML;button.innerHTML=`<span class="po-button-spinner"></span> Preparing ${type} Preview…`;button.disabled=true;}
    else if(button.dataset.idleHtml){button.innerHTML=button.dataset.idleHtml;delete button.dataset.idleHtml;button.disabled=false;}
  });
  if(!busy)syncActions();
}
async function switchPreview(type){
  setPreviewBusy(type,true);
  try{
    const docs=latestDocs(),doc=type==='DR'?docs.drPreview:docs.siPreview;
    $('poModalSiTab').classList.toggle('is-active',type==='SI');$('poModalDrTab').classList.toggle('is-active',type==='DR');
    $('poDocumentFrame').src=doc?fileUrl(doc.fileId):await draftPreviewUrl(type);
    if(!doc)setStatus('Ready to preview','Draft preview generated. The order has not been confirmed or saved to Warehouse V2.');
  }catch(error){showError(error);}finally{setPreviewBusy(type,false);}
}
async function openPreview(type='SI'){
  const docs=latestDocs();
  if(docs.siPreview||docs.drPreview){if(state.currentTransaction)await openModal(state.currentTransaction,type);return;}
  if(!state.currentPoId||!state.calculated)return;
  const modal=$('poDocumentModal');modal.hidden=false;document.body.classList.add('po-modal-open');
  $('poDocumentModalTitle').textContent=`PO ${state.extracted.poNumber||''} Draft Preview`;$('poDocumentModalMeta').textContent='Preview only · order not confirmed or saved';
  renderDocumentList(state.currentTransaction||{id:state.currentPoId,files:[],documents:[]});await switchPreview(type);
}
async function viewOriginal(){
  if(state.objectUrl){
    const modal=$('poDocumentModal');modal.hidden=false;document.body.classList.add('po-modal-open');$('poDocumentModalTitle').textContent=`Original PO ${state.extracted&&state.extracted.poNumber||''}`;$('poDocumentModalMeta').textContent=state.file&&state.file.name||'';$('poDocumentFrame').src=state.objectUrl;renderDocumentList({id:state.currentPoId,files:[],documents:[]});return;
  }
  const tx=await detailedTransaction(state.currentTransaction);if(!tx)return;
  state.currentTransaction=tx;const original=tx.poFile||(tx.files||[]).filter(file=>file.kind==='PO').sort((a,b)=>num(b.version)-num(a.version))[0];if(!original)return;
  const modal=$('poDocumentModal');modal.hidden=false;document.body.classList.add('po-modal-open');$('poDocumentModalTitle').textContent=`Original PO ${tx.poNumber}`;$('poDocumentModalMeta').textContent=original.originalFilename||'';$('poDocumentFrame').src=fileUrl(original.id);renderDocumentList(tx);
}
function currentDocumentSource(){
  const tx=state.currentTransaction||{},draft=String(tx.id||'').startsWith('draft-');
  const poFile=tx.poFile||(tx.files||[]).find(file=>file&&file.kind==='PO'&&file.active!==false);
  return{
    ...(draft?state.extracted||{}:{}),...tx,
    sourceFilename:draft?(state.extracted&&state.extracted.sourceFilename):(tx.sourceFilename||(poFile&&poFile.originalFilename)),
    poFile,
    customerCode:tx.customerCode||(state.extracted&&state.extracted.customerCode)||$('e-buyer')?.value,
    poNumber:tx.poNumber||(state.extracted&&state.extracted.poNumber)||$('e-po')?.value,
    documentDate:draft?$('e-date')?.value:(tx.poDate||tx.documentDate||tx.date||tx.orderDate||tx.requiredDeliveryDate||$('e-date')?.value)
  };
}
function triggerBlobDownload(blob,filename){
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function setDownloadBusy(type,busy,done=false){
  const buttons=Array.from(document.querySelectorAll(`[data-po-download="${type}"]`));
  buttons.forEach(button=>{
    if(busy){if(!button.dataset.idleHtml)button.dataset.idleHtml=button.innerHTML;button.innerHTML=`<span class="po-button-spinner"></span> Preparing ${type} Print PDF…`;button.disabled=true;return;}
    if(done){button.innerHTML='✓ Downloaded';button.disabled=true;window.setTimeout(()=>{if(button.dataset.idleHtml){button.innerHTML=button.dataset.idleHtml;delete button.dataset.idleHtml;}button.disabled=false;syncActions();},900);return;}
    if(button.dataset.idleHtml){button.innerHTML=button.dataset.idleHtml;delete button.dataset.idleHtml;}button.disabled=false;
  });
  if(!busy&&!done)syncActions();
}
async function downloadCurrent(type){
  const docs=latestDocs(),doc=type==='DR'?docs.drOverlay:docs.siOverlay,filename=Entry.documentFilename(type,currentDocumentSource());
  if(!state.currentPoId&&!doc)return;
  let done=false;setDownloadBusy(type,true);
  try{
    if(doc)await downloadFile(doc.fileId,filename);
    else triggerBlobDownload(await draftPdfBlob(type,'OVERLAY'),filename);
    done=true;setStatus('Ready to download',`${filename} downloaded${state.orderSaved?'.':' without saving the order.'}`);
  }catch(error){showError(error);}finally{setDownloadBusy(type,false,done);}
}
async function downloadFile(fileId,filename='',button=null){
  if(!filename){const link=document.createElement('a');link.href=fileUrl(fileId,true);link.download='';document.body.append(link);link.click();link.remove();return;}
  if(button){button.dataset.idleHtml=button.innerHTML;button.innerHTML='<span class="po-button-spinner"></span> Downloading…';button.disabled=true;}
  try{const response=await fetch(fileUrl(fileId,true),{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error(`Download failed (${response.status}).`);triggerBlobDownload(await response.blob(),filename);}
  finally{if(button){button.innerHTML=button.dataset.idleHtml||'Download';delete button.dataset.idleHtml;button.disabled=false;}}
}
async function downloadPrintFile(poId,type,button=null){
  const tx=transactionById(poId);if(!tx)return;
  state.currentTransaction=await detailedTransaction(tx);await downloadCurrent(type,button);
}
function dateOnly(value){if(!value)return'—';const date=new Date(value);return Number.isNaN(date.getTime())?esc(value):date.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});}
function docType(file,documents){const document=documents.find(doc=>doc.fileId===file.id);if(file.kind==='PO')return'Original PO PDF';return document?`${document.type} ${document.variant==='PREVIEW'?'Preview PDF':'Print Overlay PDF'}`:file.kind;}
function renderDocumentList(transaction){
  const host=$('poDocumentList');if(!host)return;const files=(transaction.files||[]).filter(file=>file.poId===transaction.id);const docs=(transaction.documents||[]).filter(doc=>doc.poId===transaction.id);
  const rows=files.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(file=>{const document=docs.find(doc=>doc.fileId===file.id),filename=document&&['SI','DR'].includes(document.type)?Entry.documentFilename(document.type,transaction):'';return`<div class="po-document-row"><div><strong>${esc(docType(file,docs))}</strong><span>${esc(file.originalFilename)} · Version ${Number(file.version)||1} · ${dateOnly(file.createdAt)}</span></div><div><button class="btn btn-secondary" onclick="WarehousePO.viewFile('${esc(file.id)}')">View</button><button class="btn btn-secondary" onclick="WarehousePO.downloadFile('${esc(file.id)}','${esc(filename)}',this)">Download</button></div></div>`;}).join('');
  host.innerHTML=`<div class="po-doc-history-title">Documents</div>${rows||'<div class="po-subtitle">No documents generated yet.</div>'}`;
}
function viewFile(fileId){$('poDocumentFrame').src=fileUrl(fileId);}
function transactionById(poId){return state.transactions.find(tx=>String(tx.id)===String(poId));}
async function openSummaryFile(poId,kind){
  const tx=transactionById(poId);if(!tx)return;state.currentTransaction=tx;
  if(kind==='PO'){await viewOriginal();return;}await openModal(tx,kind);
}
function openOrderDocuments(poId){const tx=transactionById(poId);if(tx)openModal(tx,'SI').catch(showError);}
function updateTotalCheck(){
  const host=$('poTotalCheck');if(!host)return;
  if(!state.extracted){host.hidden=true;return;}
  const poTotal=money(state.extracted.poTotal),calculatedTotal=money(getEntryLines().reduce((sum,line)=>sum+num(line.querySelector('.entry-packs').value)*num(line.querySelector('.entry-price').value),0)),difference=money(calculatedTotal-poTotal),matches=Math.abs(difference)<0.01;
  host.hidden=false;$('poExtractedTotal').textContent=`₱${poTotal.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;$('poCalculatedTotal').textContent=`₱${calculatedTotal.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const result=$('poTotalResult');result.textContent=matches?'✓ Exact match':`Difference: ₱${Math.abs(difference).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;result.classList.toggle('is-match',matches);result.classList.toggle('is-mismatch',!matches);
}
function summaryText(value){return String(value||'').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function summaryDocumentFor(item){
  const po=normalize(summaryText(item.po)),buyers=(item.buyerNames||[]).map(normalize);
  return state.summaryDocuments.find(document=>{
    const documentPo=normalize(document.po||document.poNumber);
    const documentBuyer=normalize(document.buyer||document.customerName||document.customerCode);
    return documentPo===po&&(!buyers.length||buyers.some(buyer=>buyer===documentBuyer||Entry.customerFamily(buyer)===Entry.customerFamily(documentBuyer)));
  })||null;
}
function summaryDocumentUrl(document,kind){
  const key=kind==='PO'?'pdf':kind.toLowerCase(),nested=document&&document.documents||{},links=document&&document.links||{};
  return document&&(document[`${key}Url`]||document[kind==='PO'?'originalUrl':`${kind.toLowerCase()}PreviewUrl`]||nested[key]||links[key])||'';
}
function renderSummaryDocumentCells(item){
  const document=summaryDocumentFor(item),empty='<td class="summary-doc-col"><span class="po-muted">—</span></td>';
  if(!document)return empty+empty+empty;
  const index=state.summaryDocuments.indexOf(document);
  const pdfSymbol='<svg class="summary-pdf-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 2.5h7l4 4v15h-11z"/><path d="M13.5 2.5v4h4"/><text x="12" y="16.2" text-anchor="middle">PDF</text></svg>';
  const previewButton=(kind,label)=>summaryDocumentUrl(document,kind)?`<button class="po-icon-action summary-pdf-action" type="button" aria-label="${label}" title="${label}" onclick="WarehousePO.openSummaryDocument(${index},'${kind}')">${pdfSymbol}</button>`:'<span class="po-muted">—</span>';
  return`<td class="summary-doc-col">${previewButton('PO','Preview original PO PDF')}</td><td class="summary-doc-col">${previewButton('SI','Preview SI PDF')}</td><td class="summary-doc-col">${previewButton('DR','Preview DR PDF')}</td>`;
}
function openSummaryDocument(index,kind){
  const document=state.summaryDocuments[Number(index)],url=summaryDocumentUrl(document,kind);if(!url)return;
  const modal=$('poDocumentModal');if(!modal){window.open(url,'_blank','noopener');return;}
  modal.hidden=false;document.body.classList.add('po-modal-open');
  $('poDocumentModalTitle').textContent=`PO ${document.po||document.poNumber||''} Documents`;
  $('poDocumentModalMeta').textContent=`${document.buyer||''} · ${kind==='PO'?'Original PO':`${kind} Preview`}`;
  $('poDocumentFrame').src=url;
}
window.renderSummaryDocumentCells=renderSummaryDocumentCells;
window.WarehousePO={init,newPo,selectFile,confirmAndSave,generate,regenerate,refreshTransactions,hasCurrentPo:()=>Boolean(state.currentPoId),reviewProductSelection,viewOriginal,openPreview,switchPreview,closeModal,downloadCurrent,downloadFile,downloadPrintFile,viewFile,openSummaryFile,openSummaryDocument,openOrderDocuments,updateTotalCheck,renderSummaryDocumentCells};
})();
