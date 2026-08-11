'use strict';
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks=[]; for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw=Buffer.concat(chunks).toString('utf8'); return raw ? JSON.parse(raw) : {};
}
function json(res,status,value) { res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value)); }
function safeError(error) { return error instanceof Error ? error.message : String(error); }
module.exports={readJsonBody,json,safeError};
