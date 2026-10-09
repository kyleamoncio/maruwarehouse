'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../api/sheets.js'),'utf8');

function bridge(fetchImpl=fetch) {
  const context = {require,module:{exports:{}},process:{env:{}},fetch:fetchImpl,AbortController,setTimeout,clearTimeout,URL,Buffer};
  vm.createContext(context);
  vm.runInContext(source+'\nglobalThis.forwardForTest=forwardToAppsScript;',context);
  return context.forwardForTest;
}
async function server(run,respond) {
  const upstream=http.createServer(respond);
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  try {await run('http://127.0.0.1:'+upstream.address().port+'/exec');}
  finally {upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
}

test('Sheets bridge deadline includes streamed response body, not only headers, with one request',async()=>{
  let headersSeen=false,requests=0;
  const forward=bridge(async(...args)=>{const response=await fetch(...args);headersSeen=true;return response;});
  await server(async url=>{
    // Warm native fetch so the test measures the body deadline, not cold startup.
    await fetch(url+'?warm');requests=0;headersSeen=false;
    const start=performance.now();
    await assert.rejects(forward(url,'fixture-only','appendProducts',{entries:[]},'V2',500),/V2 Apps Script timed out after 1 seconds/);
    assert.equal(headersSeen,true,'headers were received before the body timed out');
    assert.equal(requests,1,'uncertain writes are never retried');
    assert.ok(performance.now()-start<1400,'does not wait for the delayed complete body');
  },(req,res)=>{
    if(req.url.includes('?warm')){res.end('warm');return;}
    requests++;res.writeHead(200,{'Content-Type':'application/json'});res.write('{');
    const timer=setTimeout(()=>res.end('"success":true}'),1800);
    res.on('close',()=>clearTimeout(timer));
  });
});

test('completed JSON and structured HTTP errors retain the existing bridge response contract',async()=>{
  const forward=bridge();
  await server(async url=>{
    const value=await forward(url,'fixture-only','health',{},'V2',1000);
    assert.deepEqual(JSON.parse(JSON.stringify(value)),{__status:409,success:false,error:'fixture conflict',details:{success:false,error:'fixture conflict',reason:'retained'}});
  },(req,res)=>{res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,error:'fixture conflict',reason:'retained'}));});
});

test('body parsing failure clears its timer and never contacts the upstream again',async()=>{
  let calls=0,cleared=0;
  const context={require,module:{exports:{}},process:{env:{}},AbortController,URL,Buffer,
    fetch:async()=>{calls++;return {status:200,ok:true,text:async()=>'<html>fixture</html>'};},
    setTimeout:()=>123,clearTimeout:id=>{assert.equal(id,123);cleared++;}};
  vm.createContext(context);vm.runInContext(source+'\nglobalThis.forwardForTest=forwardToAppsScript;',context);
  await assert.rejects(context.forwardForTest('http://fixture.invalid','fixture-only','appendProducts',{},'V2',500),/non-JSON/);
  assert.equal(calls,1);assert.equal(cleared,1);
});
