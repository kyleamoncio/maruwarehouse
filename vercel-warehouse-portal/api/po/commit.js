'use strict';
const crypto=require('node:crypto');
const {readJsonBody,json,safeError}=require('../../lib/api-utils');
const {sanitizeFilename,validatePdfBuffer,getRequestUser,requireRole}=require('../../lib/auth');
const {callV2}=require('../../lib/apps-script-client');
const {ExtractedPoSchema}=require('../../lib/po-schemas');
const {validateForGeneration}=require('../../lib/po-core');
const {generateDocumentPdf,PROVISIONAL_TEMPLATES}=require('../../lib/pdf-documents');
const {documentFilename}=require('../../public/po-entry-integration');
const {sha256,putPrivatePdfIdempotent}=require('../../lib/private-storage');
const {documentLink}=require('../../lib/document-links');

function originalBuffer(body){
  const value=String(body.originalPdfBase64||body.fileBase64||'');
  return Buffer.from(value.includes(',')?value.slice(value.indexOf(',')+1):value,'base64');
}
function segment(value,fallback){return String(value||fallback).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)||fallback;}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>!key.startsWith('_')).map(key=>[key,stable(value[key])]));
  return value;
}
function commitIdentity(body,buffer){
  const source={reviewed:body.reviewed,calculated:body.calculated,originalHash:sha256(buffer)};
  return crypto.createHash('sha256').update(JSON.stringify(stable(source))).digest('hex');
}
function validateCommit(body,buffer){
  const pdf=validatePdfBuffer(buffer,body.mimeType||'application/pdf');
  if(!pdf.valid)throw new Error(pdf.error);
  const reviewed=ExtractedPoSchema.safeParse(body.reviewed);
  if(!reviewed.success)throw new Error(reviewed.error.issues.map(issue=>issue.message).join(' '));
  const calculated=body.calculated;
  const validation=validateForGeneration(calculated||{});
  if(!calculated||!Array.isArray(calculated.lines)||!validation.canGenerate||!calculated.totals||calculated.totals.poMatches===false)throw new Error('Reviewed/calculated PO data is not ready for document commit.');
  if(String(calculated.poNumber||'')!==String(body.reviewed.poNumber||''))throw new Error('Reviewed and calculated PO numbers do not match.');
}
function displayDate(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value||''):date.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'});
}

async function commitDocuments(req,body){
  const buffer=originalBuffer(body);validateCommit(body,buffer);
  const reviewed=body.reviewed,calculated=body.calculated,commitId=commitIdentity(body,buffer);
  const customer=segment(reviewed.customerCode||reviewed.customerName,'UNKNOWN');
  const po=segment(reviewed.poNumber,'NO_PO');
  const root=`po/${customer}/${po}-${commitId.slice(0,20)}`;
  const sourceName=String(body.filename||reviewed.sourceFilename||'purchase-order.pdf');
  const originalPath=`${root}/original/source.pdf`;
  const transaction={...reviewed,...calculated,date:displayDate(reviewed.documentDate||reviewed.poDate||reviewed.requiredDeliveryDate),customerName:reviewed.customerName||reviewed.customerCode,address:reviewed.deliveryAddress||reviewed.address,poNumber:reviewed.poNumber,paymentTerms:reviewed.paymentTerms,tin:reviewed.tin};
  const persisted=[{kind:'PDF',pathname:originalPath,filename:sanitizeFilename(sourceName),bytes:buffer}];
  for(const type of ['SI','DR']){
    const template=type==='SI'?PROVISIONAL_TEMPLATES.WATSONS_SI_V1:PROVISIONAL_TEMPLATES.WATSONS_DR_V1;
    const bytes=Buffer.from(await generateDocumentPdf({type,variant:'PREVIEW',template,transaction}));
    persisted.push({kind:type,pathname:`${root}/generated/${type.toLowerCase()}-preview.pdf`,filename:documentFilename(type,{...reviewed,documentDate:reviewed.documentDate||reviewed.poDate||reviewed.requiredDeliveryDate}),bytes});
  }
  await Promise.all(persisted.map(file=>putPrivatePdfIdempotent(file.pathname,file.bytes)));
  const links=Object.fromEntries(persisted.map(file=>[file.kind.toLowerCase(),documentLink(req,{pathname:file.pathname,filename:file.filename})]));
  const summary={
    commitId,date:reviewed.documentDate||reviewed.poDate||'',buyer:body.buyer||reviewed.branch||reviewed.customerName||reviewed.customerCode,
    po:String(reviewed.poNumber||''),si:String(reviewed.siNumber||''),pdfUrl:links.pdf,siUrl:links.si,drUrl:links.dr,
    originalFilename:sourceName,updatedAt:new Date().toISOString()
  };
  const identity={date:summary.date,buyer:summary.buyer,po:summary.po,si:summary.si};
  const upsert=await callV2('upsertSummaryDocuments',{identity,links},{timeoutMs:30000});
  return {success:true,commitId,links,documents:{...summary,identity},upsert};
}

async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{success:false,error:'Method not allowed.'});
  const user=getRequestUser(req);
  if(user&&!requireRole(user,'operator'))return json(res,403,{success:false,error:'You do not have permission to commit order documents.'});
  try{return json(res,200,await commitDocuments(req,await readJsonBody(req)));}
  catch(error){return json(res,500,{success:false,error:`Order lines were saved, but document commit failed: ${safeError(error)}`,orderSaved:true});}
}
handler.commitDocuments=commitDocuments;
handler.commitIdentity=commitIdentity;
handler.validateCommit=validateCommit;
module.exports=handler;
