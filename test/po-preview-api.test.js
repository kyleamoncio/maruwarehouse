'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const previewHandler=require('../api/po/preview');

function callPreview(body){
  const req=Readable.from([JSON.stringify(body)]);req.method='POST';
  return new Promise((resolve,reject)=>{
    const headers={};
    const res={statusCode:200,setHeader(name,value){headers[String(name).toLowerCase()]=value;},end(payload){resolve({statusCode:this.statusCode,headers,payload:Buffer.from(payload||'')});}};
    Promise.resolve(previewHandler(req,res)).catch(reject);
  });
}

test('preview API accepts validated calculated data without a Sheets round trip and returns the requested filename',async()=>{
  const reviewed={customerCode:'WATSONS',customerName:'WATSONS PERSONAL CARE',sourceFilename:'mail-1116551101_0_PO96916695477609.pdf',poNumber:'9691669',documentDate:'2026-07-26',poTotal:100,lines:[{matched:true,poQuantity:1,packsPerPhysicalCarton:1,lineAmount:100,poLineAmount:100}]};
  const calculated={...reviewed,lines:[{...reviewed.lines[0],internalProductName:'Cotton Pads Fluffy',invoiceDescription:'COTTON PADS',drDescription:'COTTON PADS',sellingQuantity:1,physicalCartons:1,effectivePackPrice:100}],totals:{poMatches:true,poTotal:100,lineTotal:100,poDifference:0}};
  const result=await callPreview({type:'SI',variant:'OVERLAY',reviewed,calculated});
  assert.equal(result.statusCode,200);
  assert.equal(result.headers['content-type'],'application/pdf');
  assert.equal(result.headers['content-disposition'],'attachment; filename="WATSONS PO96916695477609 9691669 SI 7-26-26.pdf"');
  assert.equal(result.payload.subarray(0,4).toString(),'%PDF');
});
