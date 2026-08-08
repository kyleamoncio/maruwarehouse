'use strict';
const {json,safeError}=require('../../lib/api-utils');
const {callV2}=require('../../lib/apps-script-client');
const {mergeDefaultMappings}=require('../../lib/po-default-mappings');

module.exports=async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{success:false,error:'Method not allowed.'});
  try{
    const bootstrap=await callV2('getPoBootstrap');
    const mappings=mergeDefaultMappings(bootstrap.mappings||[]).filter(mapping=>mapping.active!==false).map(mapping=>({
      id:String(mapping.id||''),customerCode:String(mapping.customerCode||''),customerArticleNumber:String(mapping.customerArticleNumber||''),
      customerProductDescription:String(mapping.customerProductDescription||''),normalizedDescription:String(mapping.normalizedDescription||''),descriptionAliases:Array.isArray(mapping.descriptionAliases)?mapping.descriptionAliases:[],
      internalSku:String(mapping.internalSku||''),internalProductName:String(mapping.internalProductName||''),invoiceDescription:String(mapping.invoiceDescription||mapping.siDescription||''),drDescription:String(mapping.drDescription||''),
      poUnit:String(mapping.poUnit||'CASE'),sellingUnit:String(mapping.sellingUnit||'PACK'),packsPerPoCase:Number(mapping.packsPerPoCase)||0,
      packsPerPhysicalCarton:Number(mapping.packsPerPhysicalCarton)||0,sellingPrice:Number(mapping.sellingPrice)||0,vatTreatment:String(mapping.vatTreatment||'VAT_INCLUSIVE'),active:true
    }));
    return json(res,200,{success:true,mappings});
  }catch(error){return json(res,500,{success:false,error:safeError(error)});}
};
