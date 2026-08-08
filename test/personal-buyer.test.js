'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const sourcePath=path.resolve(__dirname,'..','public','index.html');

test('Portal exposes only PERSONAL and canonicalizes every SAMPLE buyer alias',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.doesNotMatch(source,/const DEFAULT_BUYERS\s*=\s*\[[^\]]*['"]SAMPLE['"]/);
  assert.doesNotMatch(source,/'SAMPLE\/PERSONAL'\s*:\s*0/);
  const defaultMatch=source.match(/const DEFAULT_BUYERS\s*=\s*(\[[^;]+\]);/);
  const canonicalMatch=source.match(/function canonicalPortalBuyer\(value\)\s*\{[\s\S]*?\n\}/);
  const functionMatch=source.match(/function normalizeBuyerList\(buyers\)\s*\{[\s\S]*?\n\}/);
  assert.ok(defaultMatch&&canonicalMatch&&functionMatch,'buyer normalization source missing');
  const context={};
  vm.runInNewContext(`const DEFAULT_BUYERS=${defaultMatch[1]};${canonicalMatch[0]};${functionMatch[0]};result=normalizeBuyerList(['SAMPLE','SAMPLES','SAMPLE/PERSONAL','PERSONAL','BUYER','ORDER BY','WATSONS GANADO']);`,context);
  assert.equal(JSON.stringify(context.result),JSON.stringify(['WATSONS GANADO','PERSONAL']));
  assert.ok(!context.result.some(value=>String(value).includes('SAMPLE')));
  assert.match(source,/const buyer = canonicalPortalBuyer\(record\.buyer\)/);
});

test('PERSONAL uses Product Master SRP in the New Entry form instead of zero revenue',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  assert.match(source,/defaultSrp/);
  assert.match(source,/PRICES\[name\]\['PERSONAL'\]\s*=\s*Number\(product\.defaultSrp\)/);
  const noRevenue=source.match(/function isNoRevenueBuyer\(buyer\)\s*\{[\s\S]*?\n\}/);
  assert.ok(noRevenue,'isNoRevenueBuyer missing');
  const context={};
  vm.runInNewContext(`${noRevenue[0]}; personal=isNoRevenueBuyer('PERSONAL'); sample=isNoRevenueBuyer('SAMPLE');`,context);
  assert.equal(context.personal,false);
  assert.equal(context.sample,true);
  const autoFill=source.match(/function autoFillPrice\(product,buyer,line\)\s*\{[\s\S]*?\n\}/);
  assert.ok(autoFill,'autoFillPrice missing');
  assert.doesNotMatch(autoFill[0],/No price needed for sample or personal/i);
});

test('Buyer Price and Restock bootstraps use the production-stable POST bridge rather than GET',()=>{
  const source=fs.readFileSync(sourcePath,'utf8');
  const helper=source.match(/async function fetchV2BootstrapResult\(fallbackMessage\)\s*\{[\s\S]*?\n\}/);
  assert.ok(helper,'fetchV2BootstrapResult missing');
  assert.match(helper[0],/fetch\(SCRIPT_URL,\s*\{[\s\S]*method:\s*'POST'/);
  assert.match(helper[0],/body:\s*JSON\.stringify\(\{\s*action:\s*'getV2Bootstrap'\s*\}\)/);
  assert.match(helper[0],/for\s*\(let attempt = 0; attempt < 2; attempt\+\+\)/);
  assert.match(helper[0],/await new Promise\(resolve => setTimeout\(resolve, 750\)\)/);
  assert.match(source,/loadV2ReferenceData[\s\S]*fetchV2BootstrapResult\('Could not load Product Master and Buyer Prices\.'/);
  assert.match(source,/loadRestockProducts[\s\S]*fetchV2BootstrapResult\('Could not load active products\.'/);
  assert.doesNotMatch(source,/\?action=getV2Bootstrap/);
});
