'use strict';

const SM_DEFAULT_MAPPINGS=Object.freeze([
  Object.freeze({id:'DEFAULT-SM-20568544',customerCode:'SM',customerArticleNumber:'20568544',customerProductDescription:'FLUFFY BATHROOM TISSUE 3P250PULLS 12S',normalizedDescription:'FLUFFY BATHROOM TISSUE 3P250PULLS 12S',internalProductName:'Bathroom Tissue 12s Fluffy',invoiceDescription:'FLUFFY BATHROOM TISSUE 3PLY 250 PULLS 12S',drDescription:'FLUFFY BATHROOM TISSUE 3PLY 250 PULLS 12S',poUnit:'CASE',sellingUnit:'PACK',packsPerPoCase:4,packsPerPhysicalCarton:4,sellingPrice:0,vatTreatment:'VAT_INCLUSIVE',active:true,source:'CANONICAL_FALLBACK'}),
  Object.freeze({id:'DEFAULT-SM-20568545',customerCode:'SM',customerArticleNumber:'20568545',customerProductDescription:'FLUFFY BATHROOM TISSUE 3P250PULLS 4S',normalizedDescription:'FLUFFY BATHROOM TISSUE 3P250PULLS 4S',internalProductName:'Bathroom Tissue 4s Fluffy',invoiceDescription:'FLUFFY BATHROOM TISSUE 3PLY 250 PULLS 4S',drDescription:'FLUFFY BATHROOM TISSUE 3PLY 250 PULLS 4S',poUnit:'CASE',sellingUnit:'PACK',packsPerPoCase:12,packsPerPhysicalCarton:12,sellingPrice:0,vatTreatment:'VAT_INCLUSIVE',active:true,source:'CANONICAL_FALLBACK'}),
  Object.freeze({id:'DEFAULT-SM-20594466',customerCode:'SM',customerArticleNumber:'20594466',customerProductDescription:'FLUFFY COTTON SQUARE PADS SINGLE 100S',normalizedDescription:'FLUFFY COTTON SQUARE PADS SINGLE 100S',internalProductName:'Cotton Pads Fluffy',invoiceDescription:'FLUFFY COTTON SQUARE PADS 100S',drDescription:'FLUFFY COTTON SQUARE PADS 100S',poUnit:'CASE',sellingUnit:'PACK',packsPerPoCase:144,packsPerPhysicalCarton:72,sellingPrice:0,vatTreatment:'VAT_INCLUSIVE',active:true,source:'CANONICAL_FALLBACK'}),
  Object.freeze({id:'DEFAULT-SM-20594468',customerCode:'SM',customerArticleNumber:'20594468',customerProductDescription:'FLUFFY COTTON BUDS PAPER STEM 400 TIPS',normalizedDescription:'FLUFFY COTTON BUDS PAPER STEM 400 TIPS',internalProductName:'Cotton Buds Fluffy',invoiceDescription:'FLUFFY COTTON BUDS PAPER STEM 400 TIPS',drDescription:'FLUFFY COTTON BUDS PAPER STEM 400 TIPS',poUnit:'CASE',sellingUnit:'PACK',packsPerPoCase:240,packsPerPhysicalCarton:240,sellingPrice:0,vatTreatment:'VAT_INCLUSIVE',active:true,source:'CANONICAL_FALLBACK'})
]);

const WATSONS_DEFAULT_MAPPINGS=Object.freeze([
  Object.freeze({id:'DEFAULT-WATSONS-50057440',customerCode:'WATSONS',customerArticleNumber:'50057440',customerProductDescription:'PLUSH FLSHBLE TISSUE 3PLY12ROLLS W CB',normalizedDescription:'PLUSH FLSHBLE TISSUE 3PLY12ROLLS W CB',descriptionAliases:['PLUSH FLSHBLE TISSUE 3PLY12ROLLS W CB','PLUSH FLEXIBLE TISSUE 3PLY 12 ROLLS W COTTON BUDS'],internalSku:'P-BT12',internalProductName:'Bathroom Tissue 12s Plush',invoiceDescription:'PLUSH BATHROOM TISSUE 3PLY 12 ROLLS WITH COTTON BUDS',drDescription:'PLUSH BATHROOM TISSUE 3PLY 12 ROLLS WITH COTTON BUDS',poUnit:'CASE',sellingUnit:'PACK',packsPerPoCase:8,packsPerPhysicalCarton:8,sellingPrice:281.45625,vatTreatment:'VAT_INCLUSIVE',active:true,source:'CANONICAL_FALLBACK'})
]);

const DEFAULT_MAPPINGS=Object.freeze([...SM_DEFAULT_MAPPINGS,...WATSONS_DEFAULT_MAPPINGS]);

function mappingKey(mapping){
  return`${String(mapping&&mapping.customerCode||'').trim().toUpperCase()}|${String(mapping&&mapping.customerArticleNumber||'').trim()}`;
}
function mergeDefaultMappings(mappings){
  const supplied=Array.isArray(mappings)?mappings:[],reserved=new Set(supplied.map(mappingKey));
  return supplied.concat(DEFAULT_MAPPINGS.filter(mapping=>!reserved.has(mappingKey(mapping))));
}

module.exports={SM_DEFAULT_MAPPINGS,WATSONS_DEFAULT_MAPPINGS,DEFAULT_MAPPINGS,mergeDefaultMappings};
