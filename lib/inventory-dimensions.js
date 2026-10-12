const reference=require('./inventory-dimensions-reference.json');
const normalize=value=>String(value||'').trim().toUpperCase().replace(/\s+/g,' ');
const byName=new Map(Object.entries(reference.products).map(([name,entry])=>[normalize(name),entry]));
function attachInventoryDimensions(result){
  if(result?.success!==true||result.source!=='WAREHOUSE_V2'||!Array.isArray(result.products))return result;
  return {...result,products:result.products.map(product=>{
    if(Array.isArray(product.dimensions)&&product.dimensions.length)return product;
    const entry=byName.get(normalize(product.name));
    if(!entry)return product;
    return {...product,dimensions:[...entry.dimensions.map(item=>({...item})),{label:'Measurement source',value:reference.source+' · '+reference.measurementDate}],dimensionsSource:reference.source};
  })};
}
module.exports={attachInventoryDimensions};
