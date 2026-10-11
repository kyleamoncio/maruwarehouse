'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../api/sheets.js'),'utf8');
const context={require,module:{exports:{}},process:{env:{}},Buffer};
vm.createContext(context);
vm.runInContext(source+'\nglobalThis.readBodyForTest=readRequestBody;',context);
for(const [name,body] of [['Buffer',Buffer.from('{"action":"getV2Bootstrap"}')],['Uint8Array',new Uint8Array(Buffer.from('{"action":"getV2Bootstrap"}'))],['string','{"action":"getV2Bootstrap"}'],['parsed object',{action:'getV2Bootstrap'}]]){
 test('Sheets request '+name+' preserves the exact action instead of silently becoming getAllData',async()=>{
  const value=await context.readBodyForTest({body});
  assert.equal(value.action,'getV2Bootstrap');
 });
}
test('native HTTP request stream retains its JSON action',async()=>{
 const value=await context.readBodyForTest({async *[Symbol.asyncIterator](){yield Buffer.from('{"action":');yield Buffer.from('"getV2Bootstrap"}');}});
 assert.equal(value.action,'getV2Bootstrap');
});
test('malformed byte bodies fail rather than dispatching a different action',async()=>{
 await assert.rejects(context.readBodyForTest({body:Buffer.from('not-json')}),/JSON|Unexpected/);
});
