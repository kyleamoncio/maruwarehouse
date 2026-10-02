'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('Vercel config excludes rejected public property and preserves routing and write timeout', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.equal(Object.hasOwn(config, 'public'), false);
  assert.deepEqual(config.rewrites, [{ source: '/', destination: '/index.html' }]);
  assert.equal(config.functions['api/sheets.js'].maxDuration, 60);
});
