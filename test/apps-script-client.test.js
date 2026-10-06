'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {callV2} = require('../lib/apps-script-client');

async function withServer(run) {
  const original = {url:process.env.WAREHOUSE_PORTAL_V2_URL,token:process.env.WAREHOUSE_PORTAL_V2_API_TOKEN};
  let handler = (_,res) => res.end('{}');
  const server = http.createServer((req,res) => handler(req,res));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  process.env.WAREHOUSE_PORTAL_V2_URL = `http://127.0.0.1:${server.address().port}/private-deployment`;
  process.env.WAREHOUSE_PORTAL_V2_API_TOKEN = 'private-token';
  try { await run(fn => { handler = fn; }); }
  finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    for (const [key,value] of Object.entries({WAREHOUSE_PORTAL_V2_URL:original.url,WAREHOUSE_PORTAL_V2_API_TOKEN:original.token})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('deadline covers native HTTP response body, not only headers', async t => {
  await withServer(async setHandler => {
    // Warm native fetch so the comfortable deadline tests body consumption, not initialization.
    await callV2('health');
    let headersReceived = false;
    const nativeFetch = global.fetch;
    global.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      headersReceived = true;
      return response;
    };
    setHandler((_,res) => {
      res.writeHead(200,{'Content-Type':'application/json'});
      res.write('{');
      const timer = setTimeout(() => res.end('"success":true}'),2000);
      res.on('close',() => clearTimeout(timer));
    });
    const started = performance.now();
    try {
      await assert.rejects(callV2('getPoBootstrap',{}, {timeoutMs:500}), /Warehouse database timed out during getPoBootstrap\./);
      assert.equal(headersReceived,true,'must reach headers before deadline');
      t.diagnostic(`500ms deadline / 2000ms delayed body rejected in ${(performance.now()-started).toFixed(1)}ms`);
    } finally { global.fetch = nativeFetch; }
  });
});


test('HTTP failures report sanitized status and media type, never upstream body', async () => {
  await withServer(async setHandler => {
    setHandler((_,res) => {
      res.writeHead(404,{'Content-Type':'text/html; private-token=secret'});
      res.end('<html>private-token private-deployment business-secret</html>');
    });
    await assert.rejects(callV2('getPoBootstrap'), error => {
      assert.equal(error.message,'Warehouse database HTTP 404 during getPoBootstrap (content-type: text/html).');
      assert.equal(error.details,undefined);
      return true;
    });
  });
});


test('invalid JSON reports protocol context without exposing body', async () => {
  await withServer(async setHandler => {
    setHandler((_,res) => {
      res.writeHead(200,{'Content-Type':'text/plain'});
      res.end('private-token business-secret');
    });
    await assert.rejects(callV2('health'), {message:'Warehouse database returned invalid JSON (HTTP 200) during health (content-type: text/plain).'});
  });
});


for (const value of [null,[],42,'unexpected']) {
  test(`rejects non-object JSON ${JSON.stringify(value)}`, async () => {
    await withServer(async setHandler => {
      setHandler((_,res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); });
      await assert.rejects(callV2('health'), {message:'Warehouse database returned an invalid response shape (HTTP 200) during health (content-type: application/json).'});
    });
  });
}


for (const field of ['customers','mappings','templates','calibrations']) {
  test(`getPoBootstrap requires source-confirmed array ${field}`, async () => {
    await withServer(async setHandler => {
      const payload = {success:true,customers:[],mappings:[],templates:[],calibrations:[]};
      payload[field] = {};
      setHandler((_,res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(payload)); });
      await assert.rejects(callV2('getPoBootstrap'), {message:'Warehouse database returned an invalid getPoBootstrap payload (HTTP 200) during getPoBootstrap (content-type: application/json).'});
    });
  });
}


test('authenticated text/plain POST preserves business payload and native 302 POST-to-GET redirect', async () => {
  await withServer(async setHandler => {
    const requests = [];
    const payload = {success:true,customers:[],mappings:[],templates:[],calibrations:[],extra:'preserved'};
    setHandler(async (req,res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      requests.push({method:req.method,url:req.url,type:req.headers['content-type'],body});
      if (req.url === '/private-deployment') { res.writeHead(302,{Location:'/result'}); res.end(); }
      else { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(payload)); }
    });
    assert.deepEqual(await callV2('getPoBootstrap',{business:{quantity:3},action:'ignored',token:'ignored'}),payload);
    assert.equal(requests.length,2);
    assert.equal(requests[0].method,'POST');
    assert.equal(requests[0].type,'text/plain;charset=utf-8');
    assert.deepEqual(JSON.parse(requests[0].body),{business:{quantity:3},action:'getPoBootstrap',token:'private-token'});
    assert.equal(requests[1].method,'GET');
    assert.equal(requests[1].body,'');
  });
});

for (const payload of [{success:false,error:'Business rule failed'},{success:false},{error:'Existing error contract'}]) {
  test(`application failure preserves message and details ${JSON.stringify(payload)}`, async () => {
    await withServer(async setHandler => {
      setHandler((_,res) => res.end(JSON.stringify(payload)));
      await assert.rejects(callV2('getPoBootstrap'), error => {
        assert.equal(error.message,payload.error || 'Warehouse database request getPoBootstrap failed.');
        assert.deepEqual(error.details,payload);
        return true;
      });
    });
  });
}

for (const status of [400,500]) {
  for (const payload of [{success:false,error:'Business rule failed',code:'INVALID',extra:{retained:true}},{success:false},{error:'Existing error contract'}]) {
    test(`HTTP ${status} application failure preserves legacy message and details ${JSON.stringify(payload)}`, async () => {
      await withServer(async setHandler => {
        let requests = 0;
        setHandler((_,res) => {
          requests++;
          res.writeHead(status,{'Content-Type':'application/json'});
          res.end(JSON.stringify(payload));
        });
        await assert.rejects(callV2('saveOrder'), error => {
          assert.equal(error.message,payload.error || 'Warehouse database request saveOrder failed.');
          assert.deepEqual(error.details,payload);
          return true;
        });
        assert.equal(requests,1);
      });
    });
  }
}

for (const payload of [null,[],42,'unexpected',{}]) {
  test(`HTTP 500 non-application JSON uses truthful HTTP diagnostic ${JSON.stringify(payload)}`, async () => {
    await withServer(async setHandler => {
      setHandler((_,res) => {
        res.writeHead(500,{'Content-Type':'application/json'});
        res.end(JSON.stringify(payload));
      });
      await assert.rejects(callV2('health'), error => {
        assert.equal(error.message,'Warehouse database HTTP 500 during health (content-type: application/json).');
        assert.equal(error.details,undefined);
        return true;
      });
    });
  });
}

for (const action of ['saveOrder','health']) {
  test(`${action} HTTP 500 JSON never retries or accepts success payload`, async () => {
    await withServer(async setHandler => {
      let requests = 0;
      setHandler((_,res) => {
        requests++;
        res.writeHead(500,{'Content-Type':'application/json'});
        res.end(JSON.stringify({success:true,diagnostic:'private-token business-secret'}));
      });
      await assert.rejects(callV2(action),{message:`Warehouse database HTTP 500 during ${action} (content-type: application/json).`});
      assert.equal(requests,1);
    });
  });
}

test('deadline before headers reports timeout without write retry', async () => {
  await withServer(async setHandler => {
    await callV2('health');
    let requests = 0;
    setHandler((_,res) => {
      requests++;
      const timer = setTimeout(() => res.end('{"success":true}'),2000);
      res.on('close',() => clearTimeout(timer));
    });
    await assert.rejects(callV2('saveOrder',{}, {timeoutMs:500}),{message:'Warehouse database timed out during saveOrder.'});
    assert.equal(requests,1);
  });
});

test('generic action accepts object payload without inventing bootstrap fields', async () => {
  await withServer(async setHandler => {
    setHandler((_,res) => res.end('{"success":true,"records":[1]}'));
    assert.deepEqual(await callV2('health'),{success:true,records:[1]});
  });
});


test('deadline timer is cleared even when JSON parsing fails', async () => {
  await withServer(async setHandler => {
    setHandler((_,res) => res.end('not JSON'));
    const nativeSetTimeout = global.setTimeout, nativeClearTimeout = global.clearTimeout;
    let deadline,cleared = false;
    global.setTimeout = (fn,ms,...args) => {
      const timer = nativeSetTimeout(fn,ms,...args);
      if (ms === 1234) deadline = timer;
      return timer;
    };
    global.clearTimeout = timer => {
      if (timer === deadline && deadline) cleared = true;
      return nativeClearTimeout(timer);
    };
    try {
      await assert.rejects(callV2('health',{}, {timeoutMs:1234}),/returned invalid JSON/);
      assert.ok(deadline);
      assert.equal(cleared,true);
    } finally { global.setTimeout = nativeSetTimeout; global.clearTimeout = nativeClearTimeout; }
  });
});
