'use strict';
// Local design server: production reads/side-effect-free previews only. All saves are blocked.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'public');
const origin = 'https://maruwarehouse.vercel.app';
const port = Number(process.env.PORT || 8001);
const reads = new Set(['getAllData', 'getV2Bootstrap', 'getSummaryDocuments']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.pdf':'application/pdf'};
function json(res,status,payload) { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload)); }
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 262144) return json(res,413,{success:false,error:'Preview request too large.'});
      }
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { return json(res,400,{success:false,error:'Invalid JSON.'}); } }
      const action = body.action || url.searchParams.get('action');
      const allowed = (url.pathname === '/api/sheets' && ['GET','POST'].includes(req.method) && reads.has(action)) ||
        (['/api/po/mappings','/api/po/file'].includes(url.pathname) && req.method === 'GET') ||
        (url.pathname === '/api/po/preview' && req.method === 'POST');
      if (!allowed) return json(res,403,{success:false,error:'Local design preview is read-only. No order, restock, document commit or setting was saved.'});
      const upstream = await fetch(origin + url.pathname + url.search, {
        method:req.method,
        headers:raw ? {'Content-Type':'application/json'} : {},
        ...(raw ? {body:raw} : {}),
        redirect:'error',
        signal:AbortSignal.timeout(65000)
      });
      const data = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {'Content-Type':upstream.headers.get('content-type') || 'application/json','Cache-Control':'no-store'});
      return res.end(data);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res,405,{success:false,error:'Method not allowed.'});
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/,''));
    if (!file.startsWith(root + path.sep)) return json(res,403,{success:false,error:'Invalid path.'});
    const data = await fs.readFile(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    json(res, error.code === 'ENOENT' ? 404 : 502, {success:false,error:error.code === 'ENOENT' ? 'Not found.' : 'Read-only preview could not reach the existing Warehouse service.'});
  }
}).listen(port,'127.0.0.1',()=>console.log(`Warehouse Studio local READ-ONLY preview: http://127.0.0.1:${port}`));
