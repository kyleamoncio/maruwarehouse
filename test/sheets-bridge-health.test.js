'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const bridgePath=path.resolve(__dirname,'..','api','sheets.js');

function response(body,status=200){
  return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)};
}

function call(handler,body){
  return new Promise((resolve,reject)=>{
    const req={method:'POST',body,query:{}};
    const res={
      statusCode:200,headers:{},
      setHeader(name,value){this.headers[name.toLowerCase()]=value;},
      end(text){try{resolve({statusCode:this.statusCode,body:JSON.parse(text),headers:this.headers});}catch(error){reject(error);}}
    };
    Promise.resolve(handler(req,res)).catch(reject);
  });
}

test('order save verifies V2 through the lightweight authenticated POST health action',async t=>{
  const oldEnv={...process.env};
  const oldFetch=global.fetch;
  t.after(()=>{
    global.fetch=oldFetch;
    for(const key of Object.keys(process.env)) if(!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env,oldEnv);
    delete require.cache[bridgePath];
  });
  process.env.WAREHOUSE_PORTAL_V2_URL='https://script.google.test/v2/exec';
  process.env.WAREHOUSE_PORTAL_V2_API_TOKEN='v2-secret';
  process.env.WAREHOUSE_PORTAL_APPS_SCRIPT_URL='https://script.google.test/original/exec';
  process.env.WAREHOUSE_PORTAL_API_TOKEN='original-secret';
  const calls=[];
  global.fetch=async(url,options={})=>{
    calls.push({url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
    if((options.method||'GET')==='GET') return response({success:false,error:'Page Not Found'},404);
    if(calls.at(-1).body?.action==='health') return response({success:true,version:'2026-08-01.36'});
    if(calls.at(-1).body?.action==='appendProducts') return response({success:true,version:'2026-07-30.35',added:1});
    return response({success:false,error:'Unexpected action'},400);
  };
  delete require.cache[bridgePath];
  const handler=require(bridgePath);
  const result=await call(handler,{action:'appendProducts',v2Only:true,entries:[{buyer:'PERSONAL',product:'Cotton Pads Fluffy',packs:1,cases:1,price:0}]});
  assert.equal(result.statusCode,200);
  assert.equal(result.body.success,true);
  assert.equal(result.body.sync.v2.success,true);
  assert.deepEqual(calls.map(call=>[call.method,call.body?.action]),[
    ['POST','health'],
    ['POST','appendProducts']
  ]);
});

test('PERSONAL canonical SRP accepted by V2 is forwarded to Original even from a stale zero-price browser',async t=>{
  const oldEnv={...process.env};
  const oldFetch=global.fetch;
  t.after(()=>{
    global.fetch=oldFetch;
    for(const key of Object.keys(process.env)) if(!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env,oldEnv);
    delete require.cache[bridgePath];
  });
  process.env.WAREHOUSE_PORTAL_V2_URL='https://script.google.test/v2/exec';
  process.env.WAREHOUSE_PORTAL_V2_API_TOKEN='v2-secret';
  process.env.WAREHOUSE_PORTAL_APPS_SCRIPT_URL='https://script.google.test/original/exec';
  process.env.WAREHOUSE_PORTAL_API_TOKEN='original-secret';
  const calls=[];
  global.fetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):null;
    calls.push({url:String(url),body});
    if(body?.action==='health') return response({success:true,version:'2026-08-08.42'});
    if(String(url).includes('/v2/')&&body?.action==='appendProducts') return response({
      success:true,version:'2026-08-08.42',summarySynced:true,
      canonicalEntries:[{...body.entries[0],price:179,priceUnit:'PACK',total:358}]
    });
    if(String(url).includes('/original/')&&body?.action==='appendProducts') return response({success:true});
    return response({success:false,error:'Unexpected action'},400);
  };
  delete require.cache[bridgePath];
  const handler=require(bridgePath);
  const result=await call(handler,{action:'appendProducts',entries:[{buyer:'PERSONAL',product:'Cotton Pads Fluffy',packs:2,cases:1,price:0,priceUnit:'PACK'}]});
  assert.equal(result.body.success,true);
  const originalCall=calls.find(call=>call.url.includes('/original/')&&call.body?.action==='appendProducts');
  assert.ok(originalCall,'Original write missing');
  assert.equal(originalCall.body.entries[0].price,179);
  assert.equal(originalCall.body.entries[0].total,358);
  assert.equal(originalCall.body.entries[0].priceUnit,'PACK');
});

test('Portal getAllData reads authoritative V2 ORDER LINES instead of Original ALL DATA',()=>{
  const source=require('node:fs').readFileSync(bridgePath,'utf8');
  const branch=source.match(/else if \(action === "getAllData"\)\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(branch,'getAllData bridge branch missing');
  assert.match(branch[0],/V2_APPS_SCRIPT_URL, V2_API_TOKEN/);
  assert.doesNotMatch(branch[0],/ORIGINAL_APPS_SCRIPT_URL|ORIGINAL_API_TOKEN/);
});

test('mixed duplicate and new V2 batch forwards only accepted indexes to Original',async t=>{
  const oldEnv={...process.env};
  const oldFetch=global.fetch;
  t.after(()=>{
    global.fetch=oldFetch;
    for(const key of Object.keys(process.env)) if(!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env,oldEnv);
    delete require.cache[bridgePath];
  });
  process.env.WAREHOUSE_PORTAL_V2_URL='https://script.google.test/v2/exec';
  process.env.WAREHOUSE_PORTAL_V2_API_TOKEN='v2-secret';
  process.env.WAREHOUSE_PORTAL_APPS_SCRIPT_URL='https://script.google.test/original/exec';
  process.env.WAREHOUSE_PORTAL_API_TOKEN='original-secret';
  const calls=[];
  global.fetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):null;
    calls.push({url:String(url),body});
    if(body?.action==='health') return response({success:true,version:'2026-08-08.42'});
    if(String(url).includes('/v2/')) return response({
      success:true,version:'2026-08-08.42',acceptedEntryIndexes:[1],
      canonicalEntries:[
        {...body.entries[0],price:179,total:179},
        {...body.entries[1],price:189,total:189}
      ],appended:[{product:body.entries[1].product}]
    });
    if(String(url).includes('/original/')) return response({success:true});
    return response({success:false,error:'Unexpected action'},400);
  };
  delete require.cache[bridgePath];
  const handler=require(bridgePath);
  const entries=[
    {buyer:'PERSONAL',product:'Cotton Pads Fluffy',packs:1,cases:1,price:0},
    {buyer:'PERSONAL',product:'Kitchen Towel Fluffy',packs:1,cases:1,price:0}
  ];
  const result=await call(handler,{action:'appendProducts',entries});
  assert.equal(result.body.success,true);
  const originalCall=calls.find(call=>call.url.includes('/original/'));
  assert.ok(originalCall,'Original write missing');
  assert.equal(originalCall.body.entries.length,1);
  assert.equal(originalCall.body.entries[0].product,'Kitchen Towel Fluffy');
});
