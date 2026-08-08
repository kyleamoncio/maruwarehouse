'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('PO pricing stays internal while New Entry keeps its original product controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const feature=fs.readFileSync(path.join(__dirname,'..','public','po-feature.js'),'utf8');
  const entry=html.slice(html.indexOf('<div id="page-entry"'),html.indexOf('<!-- == RESTOCK == -->'));
  assert.doesNotMatch(entry,/PO Unit Price|Official PO Amount|Effective Net \/ Pack|entry-po-source/);
  assert.match(entry,/Case Quantity/);
  assert.match(entry,/Pack Quantity/);
  assert.match(entry,/Price per Pack/);
  assert.match(feature,/lineAmount\|\|original\.poLineAmount/);
  assert.match(feature,/amount\/packs/);
});
