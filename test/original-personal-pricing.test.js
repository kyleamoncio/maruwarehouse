'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sourcePath=path.resolve(__dirname,'..','..','Code.gs');

test('Original backend treats PERSONAL as an SRP sale while SAMPLE remains no-revenue',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const helper=source.match(/function prepareProductAppend_\([\s\S]*?\n\}/);
  assert.ok(helper,'prepareProductAppend_ missing');
  assert.match(helper[0],/isNoRevenueEntry\s*=\s*buyerKey\s*===\s*["']SAMPLE["']/);
  assert.doesNotMatch(helper[0],/buyerKey\s*===\s*["']PERSONAL["']/);
  assert.match(helper[0],/priceNum\s*=\s*isNoRevenueEntry\s*\?\s*0\s*:\s*Number\(price\)/);
});
