(function initPoEntryIntegration(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WarehousePOEntry=api;
}(typeof globalThis!=='undefined'?globalThis:this,function poEntryIntegrationFactory(){
  'use strict';
  const clean=value=>String(value==null?'':value).trim();
  const normalize=value=>clean(value).toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const number=value=>Number(value)||0;
  const money=value=>Math.round((number(value)+Number.EPSILON)*100)/100;
  const precisePrice=value=>Math.round((number(value)+Number.EPSILON)*1000000)/1000000;

  function customerFamily(value){
    const key=normalize(value);
    if(key.includes('WATSONS'))return'WATSONS';
    if(/(^| )SM( |$)|SUPER SHOPPING MARKET|SM HYPERMARKET/.test(key))return'SM';
    return key;
  }

  function portalBuyer(po){
    const family=customerFamily(po.customerCode||po.customerName);
    const branch=normalize(po.branch||po.deliveryAddress);
    if(family==='SM')return'SM HYPERMARKET';
    if(family==='WATSONS'){
      if(branch.includes('PAMPANGA'))return'WATSONS PAMPANGA';
      if(branch.includes('CEBU'))return'WATSONS CEBU';
      if(branch.includes('GANADO'))return'WATSONS GANADO';
      return'WATSONS PAMPANGA';
    }
    return clean(po.customerName||po.customerCode);
  }

  function addCalendarMonths(iso,months){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(clean(iso)))return'';
    const [year,month,day]=iso.split('-').map(Number);
    const result=new Date(Date.UTC(year,month-1,1));
    result.setUTCMonth(result.getUTCMonth()+months);
    const last=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();
    result.setUTCDate(Math.min(day,last));
    return result.toISOString().slice(0,10);
  }

  function dueDateFor(po,documentDate){
    const explicit=clean(po.dueDate);
    if(explicit)return explicit;
    const terms=normalize(po.paymentTerms);
    const base=clean(documentDate||po.poDate);
    const days=terms.match(/(\d+) DAYS?/);
    if(days){
      const count=Number(days[1]);
      if(count===30||count===60||count===90)return addCalendarMonths(base,count/30);
      if(/^\d{4}-\d{2}-\d{2}$/.test(base)){
        const date=new Date(`${base}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10);
      }
    }
    return addCalendarMonths(base,customerFamily(po.customerCode)==='SM'?1:2);
  }

  function manilaDateIso(value=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).reduce((result,part)=>(result[part.type]=part.value,result),{});
    return`${parts.year}-${parts.month}-${parts.day}`;
  }

  function entryLineAmount({packs=0,cases=0,price=0,priceUnit='PACK',poWorkflow=false}={}){
    const quantity=poWorkflow?number(packs):(normalize(priceUnit)==='CASE'?number(cases):number(packs));
    return money(quantity*number(price));
  }

  function buildEntryDraft(calculated,options={}){
    const po=calculated||{};
    const documentDate=clean(options.documentDate||po.poDate||po.requiredDeliveryDate||manilaDateIso());
    const lines=(po.lines||[]).map((line,index)=>({
      sourceIndex:index,product:line.matched?clean(line.internalProductName):'',
      cases:line.matched?number(line.physicalCartons):0,packs:line.matched?number(line.sellingQuantity):0,
      price:line.matched?precisePrice((number(line.lineAmount)||number(line.poLineAmount))/number(line.sellingQuantity)):0,
      needsReview:!line.matched,customerArticleNumber:clean(line.customerArticleNumber),customerDescription:clean(line.customerDescription),
      poQuantity:number(line.poQuantity),poUnit:clean(line.poUnit||'CASE'),unitPrice:money(line.unitPrice),discount:money(line.discount),
      lineAmount:money(line.lineAmount||line.poLineAmount),roundingAdjustment:0,mappingId:clean(line.mappingId),matchMethod:clean(line.matchMethod),confidence:number(line.confidence)
    }));
    const officialLineTotal=money(lines.reduce((sum,line)=>sum+line.lineAmount,0));
    const roundingAdjustment=money(money(po.poTotal)-officialLineTotal);
    if(customerFamily(po.customerCode||po.customerName)==='SM'&&Math.abs(roundingAdjustment)>0&&Math.abs(roundingAdjustment)<=0.25){
      const balancingLine=[...lines].reverse().find(line=>!line.needsReview&&line.packs>0);
      if(balancingLine){
        const balancedAmount=money(balancingLine.lineAmount+roundingAdjustment);
        balancingLine.price=Math.round((balancedAmount/balancingLine.packs+Number.EPSILON)*1000000000)/1000000000;
        balancingLine.roundingAdjustment=roundingAdjustment;
      }
    }
    return{
      order:{
        buyer:portalBuyer(po),poNumber:clean(po.poNumber),siNumber:clean(po.siNumber),documentDate,
        poDate:clean(po.poDate),deliveryDate:clean(po.requiredDeliveryDate),dueDate:dueDateFor(po,documentDate),
        paymentTerms:clean(po.paymentTerms),deliveryLocation:clean(po.branch),deliveryAddress:clean(po.deliveryAddress),
        tin:clean(po.tin),currency:clean(po.currency||'PHP'),vatTreatment:clean(po.vatTreatment||'VAT_INCLUSIVE'),poTotal:money(po.poTotal),poRoundingAdjustment:roundingAdjustment
      },
      lines
    };
  }

  function productTokenKey(value){return normalize(value).split(' ').filter(Boolean).sort().join(' ');}
  function resolvePortalProductName(value,availableProducts){
    const wanted=productTokenKey(value);
    return(availableProducts||[]).find(product=>productTokenKey(product)===wanted)||'';
  }

  function summaryPoNumber(item){return clean(item&&item.po).replace(/<br\s*\/?>(.*)$/i,'').replace(/<[^>]*>/g,'');}
  function summaryFamily(item){return customerFamily(((item&&item.buyerNames)||[])[0]||'');}
  function findSummaryTransaction(item,transactions){
    const po=normalize(summaryPoNumber(item));
    const family=summaryFamily(item);
    if(!po||!family)return null;
    return(transactions||[]).find(tx=>normalize(tx.poNumber)===po&&customerFamily(tx.customerCode||tx.customerName)===family)||null;
  }
  function latestDocument(transaction,type,variant){
    const txId=clean(transaction&&transaction.id);
    return((transaction&&transaction.documents)||[])
      .filter(doc=>clean(doc.poId)===txId&&doc.type===type&&doc.variant===variant)
      .sort((a,b)=>number(b.version)-number(a.version))[0]||null;
  }
  function currentDocuments(transaction){return{
    siPreview:latestDocument(transaction,'SI','PREVIEW'),siOverlay:latestDocument(transaction,'SI','OVERLAY'),
    drPreview:latestDocument(transaction,'DR','PREVIEW'),drOverlay:latestDocument(transaction,'DR','OVERLAY')
  };}
  function documentShortDate(value){
    const raw=clean(value);
    let year,month,day;
    let match=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(match){year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);}
    else{
      match=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
      if(match){month=Number(match[1]);day=Number(match[2]);year=Number(match[3]);if(year<100)year+=2000;}
      else{const parsed=new Date(raw);if(!Number.isNaN(parsed.getTime())){year=parsed.getFullYear();month=parsed.getMonth()+1;day=parsed.getDate();}}
    }
    return year&&month&&day?`${month}-${day}-${String(year).slice(-2)}`:'';
  }
  function sourceDocumentId(source={}){
    const filename=clean(source.sourceFilename||source.originalFilename||(source.poFile&&source.poFile.originalFilename));
    const match=filename.match(/(?:^|[_\s-])(PO\d{10,})(?=[_.\s-]|$)/i);
    return match?match[1].toUpperCase():'';
  }
  function documentFilename(type,source={}){
    const family=customerFamily(source.customerCode||source.customerName||source.buyer)||'BUYER';
    const po=clean(source.poNumber||source.po).replace(/[^A-Za-z0-9_-]/g,'');
    const date=documentShortDate(source.documentDate||source.date||source.orderDate||source.poDate||source.requiredDeliveryDate);
    const sourceId=family==='WATSONS'?sourceDocumentId(source):'';
    const documentType=normalize(type)||'PDF';
    const parts=family==='WATSONS'
      ? [family,sourceId,po,documentType,date]
      : [family,documentType,sourceId,po,date];
    return parts.filter(Boolean).join(' ')+'.pdf';
  }

  function poTotalTolerance(customerCode){return customerFamily(customerCode)==='SM'?0.25:0.01;}

  return{normalize,customerFamily,portalBuyer,addCalendarMonths,dueDateFor,buildEntryDraft,entryLineAmount,productTokenKey,resolvePortalProductName,findSummaryTransaction,latestDocument,currentDocuments,documentShortDate,sourceDocumentId,documentFilename,poTotalTolerance,manilaDateIso};
}));
