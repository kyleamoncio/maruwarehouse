const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'public', 'index.html');
const apiPath = path.join(root, 'api', 'sheets.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
for (const [i, script] of scripts.entries()) {
  new Function(script);
  console.log(`inline script ${i + 1}: ok (${script.length} chars)`);
}
require(apiPath);
console.log('api/sheets.js: ok');
console.log('frontend default API:', html.includes("DEFAULT_API_URL = '/api/sheets'") ? 'ok' : 'missing');

const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const forbidden of ['GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'service-account.json', 'credentials.json']) {
  if (envExample.includes(forbidden)) throw new Error(`forbidden env/credential reference in .env.example: ${forbidden}`);
}
console.log('bridge env example: ok');
