'use strict';
const {readJsonBody,json,safeError}=require('../../lib/api-utils');
const {callV2}=require('../../lib/apps-script-client');
const {applyMappingsAndCalculate,validateForGeneration}=require('../../lib/po-core');
const {mergeDefaultMappings}=require('../../lib/po-default-mappings');
const {generateDocumentPdf,PROVISIONAL_TEMPLATES}=require('../../lib/pdf-documents');
const {documentFilename}=require('../../public/po-entry-integration');

function displayDate(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value||''):date.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'});
}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{success:false,error:'Method not allowed.'});
  try{
    const body=await readJsonBody(req),type=String(body.type||'').toUpperCase(),variant=String(body.variant||'PREVIEW').toUpperCase(),reviewed=body.reviewed||{};
    if(!['SI','DR'].includes(type))return json(res,400,{success:false,error:'Preview type must be SI or DR.'});
    if(!['PREVIEW','OVERLAY'].includes(variant))return json(res,400,{success:false,error:'Variant must be PREVIEW or OVERLAY.'});
    let calculated=body.calculated;
    if(!calculated||!Array.isArray(calculated.lines)||!calculated.totals){
      const bootstrap=await callV2('getPoBootstrap');
      calculated=applyMappingsAndCalculate(reviewed,mergeDefaultMappings(bootstrap.mappings||[]));
    }
    const validation=validateForGeneration(calculated);
    if(!validation.canGenerate||!calculated.totals||calculated.totals.poMatches===false){
      return json(res,422,{success:false,error:'Review the highlighted products, quantities, prices, and PO total before previewing.',validation,totals:calculated.totals});
    }
    const transaction={
      ...reviewed,...calculated,
      date:displayDate(reviewed.documentDate||reviewed.requiredDeliveryDate||reviewed.poDate),
      customerName:reviewed.customerName||reviewed.customerCode,
      address:reviewed.deliveryAddress||reviewed.address,
      poNumber:reviewed.poNumber,
      paymentTerms:reviewed.paymentTerms,
      tin:reviewed.tin
    };
    const template=type==='SI'?PROVISIONAL_TEMPLATES.WATSONS_SI_V1:PROVISIONAL_TEMPLATES.WATSONS_DR_V1;
    const bytes=await generateDocumentPdf({type,variant,template,transaction});
    res.statusCode=200;
    res.setHeader('Content-Type','application/pdf');
    const filename=documentFilename(type,{...reviewed,documentDate:reviewed.documentDate||reviewed.requiredDeliveryDate||reviewed.poDate});
    res.setHeader('Content-Disposition',`${variant==='PREVIEW'?'inline':'attachment'}; filename="${filename}"`);
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    res.end(Buffer.from(bytes));
  }catch(error){return json(res,500,{success:false,error:safeError(error)});}
};
