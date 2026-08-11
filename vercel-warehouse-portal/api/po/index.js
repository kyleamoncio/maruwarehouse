'use strict';
const crypto = require('node:crypto');
const { requireAuthenticated, sanitizeFilename, validatePdfBuffer, requireRole } = require('../../lib/auth');
const { readJsonBody, json, safeError } = require('../../lib/api-utils');
const { callV2 } = require('../../lib/apps-script-client');
const { ExtractedPoSchema } = require('../../lib/po-schemas');
const { sha256, putPrivatePdf, deletePrivateFile } = require('../../lib/private-storage');

function bufferFromBody(body) {
  const value=String(body.fileBase64 || '');
  const data=value.includes(',') ? value.slice(value.indexOf(',')+1) : value;
  return Buffer.from(data,'base64');
}
async function storeOriginal(body,user,isReplacement) {
  const buffer=bufferFromBody(body),validation=validatePdfBuffer(buffer,body.mimeType || 'application/pdf');
  if(!validation.valid) throw new Error(validation.error);
  const extractedValidation=isReplacement?null:ExtractedPoSchema.safeParse(body.extracted);
  if(!isReplacement && !extractedValidation.success) throw new Error(extractedValidation.error.issues.map(issue=>issue.message).join(' '));
  const poId=isReplacement ? String(body.poId || '') : `PO-${crypto.randomUUID()}`;
  if(!poId) throw new Error('PO transaction ID is required.');
  const fileId=`FILE-${crypto.randomUUID()}`,filename=sanitizeFilename(body.filename),hash=sha256(buffer);
  const customer=String((body.extracted&&body.extracted.customerCode)||body.customerCode||'UNKNOWN').replace(/[^A-Za-z0-9_-]/g,'_');
  const pathname=`po/${customer}/${poId}/original/${fileId}-${filename}`;
  const blob=await putPrivatePdf(pathname,buffer);
  const file={id:fileId,poId,pathname:blob.pathname,originalFilename:body.filename || filename,size:buffer.length,fileHash:hash};
  try {
    if(isReplacement) {
      const result=await callV2('replacePoFile',{poId,file});
      return {...result,file:{id:fileId,name:file.originalFilename,size:file.size,hash,viewUrl:`/api/po/file?fileId=${encodeURIComponent(fileId)}`}};
    }
    const extracted=body.extracted;
    const result=await callV2('createPoTransaction',{transaction:{id:poId,...extracted,extracted,reviewed:extracted,calculation:{},status:'Needs review'},file});
    return {...result,transaction:{id:poId,...extracted,status:'Needs review',activePoFileId:fileId},file:{id:fileId,name:file.originalFilename,size:file.size,hash,viewUrl:`/api/po/file?fileId=${encodeURIComponent(fileId)}`}};
  } catch(error) { await deletePrivateFile(blob.pathname).catch(()=>{}); throw error; }
}

module.exports=async function handler(req,res){
  const user=requireAuthenticated(req,res,'viewer'); if(!user)return;
  try{
    if(req.method==='GET'){
      const mode=String(req.query&&req.query.mode||'list');
      if(mode==='bootstrap')return json(res,200,await callV2('getPoBootstrap'));
      if(mode==='detail')return json(res,200,await callV2('getPoTransaction',{poId:req.query.poId}));
      return json(res,200,await callV2('listPoTransactions'));
    }
    if(req.method!=='POST')return json(res,405,{success:false,error:'Method not allowed.'});
    const body=await readJsonBody(req),action=String(body.action||'');
    if(action==='upload'){
      if(!requireRole(user,'operator'))return json(res,403,{success:false,error:'You do not have permission to upload POs.'});
      return json(res,200,await storeOriginal(body,user,false));
    }
    if(action==='replace'){
      if(!requireRole(user,'manager'))return json(res,403,{success:false,error:'Only a manager can replace an original PO.'});
      return json(res,200,await storeOriginal(body,user,true));
    }
    if(action==='saveReview'){
      if(!requireRole(user,'operator'))return json(res,403,{success:false,error:'You do not have permission to review POs.'});
      const result=await callV2('savePoReview',{poId:body.poId,reviewed:body.reviewed,calculation:body.calculation,status:'Reviewed',corrections:body.corrections||[]});
      return json(res,200,result);
    }
    if(action==='saveCalibration'){
      if(!requireRole(user,'manager'))return json(res,403,{success:false,error:'Only a manager can save printer calibration.'});
      return json(res,200,await callV2('savePrinterCalibration',{poId:body.poId,calibration:body.calibration}));
    }
    return json(res,400,{success:false,error:'Unknown PO action.'});
  }catch(error){const status=error&&error.details&&error.details.duplicate?409:500;return json(res,status,{success:false,error:safeError(error),details:error&&error.details});}
};
