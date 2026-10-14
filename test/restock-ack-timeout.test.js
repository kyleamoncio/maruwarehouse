'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
function fixture(){
 const file=path.join(__dirname,'../api/sheets.js'),tasks=new Map(),calls=[];
 let next=0,now=0,resolveBody,reply,status;
 const context={module:{exports:{}},exports:{},require:createRequire(file),Buffer,URL,AbortController,
  process:{env:{WAREHOUSE_PORTAL_V2_URL:'https://fixture.invalid/v2',WAREHOUSE_PORTAL_V2_API_TOKEN:'synthetic-test-only'}},
  setTimeout(fn,delay){const id=++next;tasks.set(id,{fn,delay,at:now+delay});return id;},clearTimeout(id){tasks.delete(id);},
  async fetch(url,options){const body=JSON.parse(options.body);calls.push({url,body});
   if(body.action==='health')return {ok:true,status:200,text:async()=>JSON.stringify({success:true,version:'2026-08-18.48'})};
   assert.equal(body.action,'appendRestocks');
   const responseBody=new Promise((resolve,reject)=>{resolveBody=resolve;options.signal.addEventListener('abort',()=>{const e=new Error('Synthetic delayed acknowledgement abort');e.name='AbortError';reject(e);},{once:true});});
   return {ok:true,status:200,text:()=>responseBody};
  }};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const entries=[{date:'2026-07-03',product:'Synthetic fixture product',cases:6,packs:48}];
 const operation=context.module.exports({method:'POST',body:{action:'appendRestocks',entries},query:{}},{setHeader(){},set statusCode(value){status=value;},end(value){reply=JSON.parse(value);}});
 return {calls,tasks,entries,operation,get reply(){return reply;},get status(){return status;},async ready(){for(let i=0;i<20&&!resolveBody;i++)await new Promise(setImmediate);assert.ok(resolveBody,'Restock must reach upstream');},advance(ms){now+=ms;for(const [id,t] of [...tasks])if(t.at<=now){tasks.delete(id);t.fn();}},ack(){resolveBody(JSON.stringify({success:true,requestId:'synthetic-fixture-id',sync:{v2:{success:true},original:{success:true}}}));}};
}
test('restock retains the same single mutation while waiting for an ACK beyond 25 seconds',async()=>{
 const f=fixture();await f.ready();f.advance(30000);f.ack();await f.operation;
 assert.equal(f.status,200);assert.equal(f.reply.success,true,'A 30-second acknowledgement must not be rejected by the old 25-second cutoff');
 assert.equal(f.calls.filter(c=>c.body.action==='appendRestocks').length,1);assert.deepEqual(f.calls[1].body.entries,f.entries);
});
test('restock deadline remains bounded and never replays an uncertain mutation',async()=>{
 const f=fixture();await f.ready();f.advance(46000);await f.operation;
 assert.equal(f.status,500);assert.match(f.reply.error,/timed out after 45 seconds/);
 assert.equal(f.calls.filter(c=>c.body.action==='appendRestocks').length,1);
 assert.equal(f.tasks.size,0);
});
test('native HTTP restock acknowledgement body survives the old cutoff',async()=>{
 const http=require('node:http');let mutations=0,received,headersSent=false;
 const upstream=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
  assert.equal(req.headers['content-type'],'text/plain;charset=utf-8');
  res.writeHead(200,{'Content-Type':'application/json'});
  if(body.action==='health')return res.end(JSON.stringify({success:true,version:'2026-08-18.48'}));
  assert.equal(body.action,'appendRestocks');mutations++;received=body;
  res.flushHeaders();headersSent=true;
  setTimeout(()=>res.end(JSON.stringify({success:true,requestId:'native-fixture-only',sync:{v2:{success:true},original:{success:true}}})),3000);
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const file=path.join(__dirname,'../api/sheets.js'),active=new Set();
 const context={module:{exports:{}},exports:{},require:createRequire(file),Buffer,URL,AbortController,fetch,
  process:{env:{WAREHOUSE_PORTAL_V2_URL:'http://127.0.0.1:'+upstream.address().port+'/v2',WAREHOUSE_PORTAL_V2_API_TOKEN:'synthetic-test-only'}},
  // Accelerated deadlines: 25 seconds => 2.5 seconds; 45 seconds => 4.5 seconds.
  setTimeout(fn,ms){const timer=setTimeout(()=>{active.delete(timer);fn();},ms/10);active.add(timer);return timer;},clearTimeout(timer){active.delete(timer);clearTimeout(timer);}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const bridge=http.createServer((req,res)=>context.module.exports(req,res));
 await new Promise(resolve=>bridge.listen(0,'127.0.0.1',resolve));
 try{
  const entries=[{date:'2026-07-03',product:'Synthetic fixture product',cases:6,packs:48}];
  const response=await fetch('http://127.0.0.1:'+bridge.address().port+'/api/sheets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'appendRestocks',entries})});
  const result=await response.json();assert.equal(headersSent,true);assert.equal(response.status,200);assert.equal(result.success,true);
  assert.equal(mutations,1);assert.deepEqual(received.entries,entries);assert.equal(active.size,0);
 }finally{bridge.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(resolve=>bridge.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);}
});
