'use strict';
const {Readable}=require('node:stream');
const {json,safeError}=require('../../lib/api-utils');
const {verifyDocumentRef}=require('../../lib/document-links');
const {getPrivatePdf}=require('../../lib/private-storage');

module.exports=async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{success:false,error:'Method not allowed.'});
  try{
    const document=verifyDocumentRef(req.query&&req.query.ref);
    if(!document)return json(res,403,{success:false,error:'This document link is invalid.'});
    const result=await getPrivatePdf(document.pathname);
    if(!result||!result.stream)return json(res,404,{success:false,error:'The PDF could not be retrieved.'});
    res.statusCode=200;
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'self'");
    res.setHeader('Content-Disposition',`${document.disposition}; filename="${document.filename}"`);
    const stream=typeof result.stream.pipe==='function'?result.stream:Readable.fromWeb(result.stream);
    stream.on('error',()=>{if(!res.headersSent)json(res,500,{success:false,error:'The PDF stream failed.'});else res.destroy();});
    stream.pipe(res);
  }catch(error){return json(res,500,{success:false,error:safeError(error)});}
};
