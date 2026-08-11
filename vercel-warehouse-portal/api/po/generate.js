'use strict';
const crypto=require('node:crypto');

const {requireAuthenticated,requireRole,sanitizeFilename}=require('../../lib/auth');
const {readJsonBody,json,safeError}=require('../../lib/api-utils');
const {callV2}=require('../../lib/apps-script-client');
const {validateForGeneration,nextDocumentVersion}=require('../../lib/po-core');
const {generateDocumentPdf,PROVISIONAL_TEMPLATES}=require('../../lib/pdf-documents');
const {documentFilename}=require('../../public/po-entry-integration');

const {sha256,putPrivatePdf,deletePrivateFile}=require('../../lib/private-storage');

function displayDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?String(value||''):date.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'});}
module.exports=async function handler(req,res){
  const user=requireAuthenticated(req,res,'operator');if(!user)return;
  if(req.method!=='POST')return json(res,405,{success:false,error:'Method not allowed.'});
  const uploaded=[];
  try{
    const body=await readJsonBody(req),detail=await callV2('getPoTransaction',{poId:body.poId}),stored=detail.transaction;
    if(!stored)throw new Error('PO transaction was not found.');
    if((stored.documents||[]).length&&!requireRole(user,'manager'))return json(res,403,{success:false,error:'Only a manager can regenerate SI or DR documents.'});
    const calculated=stored.calculation&&Array.isArray(stored.calculation.lines)?stored.calculation:stored.reviewed;
    const validation=validateForGeneration(calculated||{});
    if(!validation.canGenerate)return json(res,422,{success:false,error:'Please review the highlighted fields before generating documents.',validation});
    const reviewed=stored.reviewed||{},sourcePoFile=stored.poFile||(stored.files||[]).find(file=>file&&file.kind==='PO'&&file.active!==false);
    const documentDate=reviewed.poDate||(calculated||{}).poDate||stored.poDate||reviewed.documentDate||reviewed.requiredDeliveryDate||stored.requiredDeliveryDate;
    const transaction={...reviewed,...(calculated||{}),documentDate,date:displayDate(documentDate),sourceFilename:reviewed.sourceFilename||(calculated||{}).sourceFilename||(sourcePoFile&&sourcePoFile.originalFilename)||'',poFile:sourcePoFile,customerName:reviewed.customerName||stored.customerName,address:reviewed.deliveryAddress||stored.deliveryAddress,poNumber:stored.poNumber,paymentTerms:reviewed.paymentTerms||stored.paymentTerms,tin:reviewed.tin||stored.tin};
    const calibration={xOffsetMm:Number(body.calibration&&body.calibration.xOffsetMm)||0,yOffsetMm:Number(body.calibration&&body.calibration.yOffsetMm)||0,scalePercent:Number(body.calibration&&body.calibration.scalePercent)||100};
    const existing=stored.documents||[],sourceReviewHash=crypto.createHash('sha256').update(JSON.stringify(transaction)).digest('hex');
    const specs=[['SI','PREVIEW','WATSONS_SI_V1'],['SI','OVERLAY','WATSONS_SI_V1'],['DR','PREVIEW','WATSONS_DR_V1'],['DR','OVERLAY','WATSONS_DR_V1']];
    const files=[],documents=[];
    for(const [type,variant,templateId] of specs){
      const template=PROVISIONAL_TEMPLATES[templateId],version=nextDocumentVersion(existing.concat(documents),type,variant),fileId=`FILE-${crypto.randomUUID()}`,documentId=`DOC-${crypto.randomUUID()}`;
      const bytes=await generateDocumentPdf({type,variant,template,calibration,transaction});
      const filename=documentFilename(type,transaction),storageFilename=sanitizeFilename(filename),pathname=`po/${stored.customerCode}/${stored.id}/generated/${fileId}-${storageFilename}`;
      const blob=await putPrivatePdf(pathname,bytes);uploaded.push(blob.pathname);
      files.push({id:fileId,poId:stored.id,kind:`${type}_${variant}`,version,pathname:blob.pathname,originalFilename:filename,size:bytes.length,fileHash:sha256(bytes),disposition:'inline'});
      documents.push({id:documentId,poId:stored.id,type,variant,version,fileId,templateId,templateVersion:template.version,calibrationId:body.calibration&&body.calibration.id||'',sourceReviewHash});
    }
    await callV2('recordGeneratedDocuments',{poId:stored.id,files,documents},{timeoutMs:30000});
    return json(res,200,{success:true,poId:stored.id,warning:'Preview files use a plain white values-only page. Print-overlay files use the final calibrated SI/DR placements.',documents:documents.map(document=>({...document,name:files.find(file=>file.id===document.fileId).originalFilename,viewUrl:`/api/po/file?fileId=${encodeURIComponent(document.fileId)}`,downloadUrl:`/api/po/file?fileId=${encodeURIComponent(document.fileId)}&download=1`}))});
  }catch(error){for(const pathname of uploaded)await deletePrivateFile(pathname).catch(()=>{});return json(res,500,{success:false,error:safeError(error)});}
};
