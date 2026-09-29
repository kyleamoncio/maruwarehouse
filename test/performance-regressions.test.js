'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.resolve(__dirname,'..','public','index.html'),'utf8');
const apiSource=fs.readFileSync(path.resolve(__dirname,'..','api','sheets.js'),'utf8');

function extractFunction(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`${name} must exist`);
  const paramsStart=source.indexOf('(',start);
  let paramsDepth=0;
  let paramsEnd=-1;
  for(let i=paramsStart;i<source.length;i++){
    if(source[i]==='(') paramsDepth++;
    else if(source[i]===')'&&--paramsDepth===0){ paramsEnd=i; break; }
  }
  const brace=source.indexOf('{',paramsEnd);
  let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{') depth++;
    else if(source[i]==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('startup restores a bounded verified data snapshot before one live refresh',()=>{
  assert.match(source,/const PORTAL_DATA_CACHE_KEY\s*=\s*'maruWarehousePortalDataV1'/);
  assert.match(source,/const PORTAL_DATA_CACHE_MAX_AGE_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(source,/function restoreCachedPortalData\s*\(/);
  assert.match(source,/function persistPortalDataCache\s*\(/);
  assert.match(source,/function updatePortalDataSyncStatus\s*\(/);
  assert.match(source,/document\.documentElement\.dataset\.sheetsStatus\s*=\s*state/);
  assert.match(source,/saved:'Showing saved data while Sheets reconnects'/);
  assert.match(source,/showToast\(quiet \? 'Refreshing Sheets data…' : 'Fetching data from Sheets…','info'\)/);
  assert.match(source,/DOMContentLoaded[\s\S]*?restoreCachedPortalData\(\)[\s\S]*?initialPortalDataLoadPromise\s*=\s*loadAllData/);
  assert.match(source,/initialPortalDataLoadPromise\.finally\(\(\)\s*=>\s*loadV2ReferenceData\(\)/);
});

test('live reads retry safely and duplicate refresh requests share one promise',()=>{
  const fetchResult=extractFunction('fetchPortalDataResult');
  const load=extractFunction('loadAllData');
  assert.match(fetchResult,/for\s*\(let attempt\s*=\s*0;\s*attempt\s*<\s*2;/);
  assert.match(fetchResult,/await new Promise\(resolve\s*=>\s*setTimeout\(resolve,\s*750\)\)/);
  assert.match(load,/if\s*\(portalDataLoadPromise\)\s*return portalDataLoadPromise/);
  assert.match(load,/persistPortalDataCache\(json\)/);
  assert.match(load,/portalDataLoadPromise\s*=\s*null/);
});

test('V2 references are reused within the session and New Entry does not force a duplicate bootstrap',()=>{
  const loadReferences=extractFunction('loadV2ReferenceData');
  const navigate=extractFunction('navigate');
  assert.match(source,/let v2ReferenceDataResult\s*=\s*null/);
  assert.match(loadReferences,/if\s*\(!force\s*&&\s*v2ReferenceDataResult\)\s*return v2ReferenceDataResult/);
  assert.match(loadReferences,/v2ReferenceDataResult\s*=\s*result/);
  assert.doesNotMatch(navigate,/loadV2ReferenceData\(true\)/);
  assert.match(navigate,/initialPortalDataLoadPromise[\s\S]*?loadV2ReferenceData\(\)/);
  assert.match(extractFunction('loadRestockProducts'),/const result\s*=\s*await loadV2ReferenceData\(\)/);
});

test('proven unreachable and duplicate render work is removed without touching primary renderers',()=>{
  const overview=extractFunction('renderOverviewStats');
  const applySaved=extractFunction('applySavedEntriesLocally');
  assert.doesNotMatch(overview,/return;\s*spotlight\.innerHTML/);
  assert.match(applySaved,/renderDashboard\(\)/);
  assert.match(applySaved,/renderAllData\(\)/);
  assert.doesNotMatch(applySaved,/renderEntryRecent\(\)/);
});

test('save preflight reuses only a recent verified V2 health response and never retries mutations',()=>{
  assert.match(apiSource,/const V2_HEALTH_CACHE_TTL_MS\s*=\s*60\s*\*\s*1000/);
  assert.match(apiSource,/function rememberV2Health\s*\(/);
  assert.match(apiSource,/Date\.now\(\)\s*-\s*v2HealthCache\.checkedAt\s*<=\s*V2_HEALTH_CACHE_TTL_MS/);
  assert.match(apiSource,/if\s*\(v2HealthPromise\)\s*return v2HealthPromise/);
  assert.match(apiSource,/ORDER_SAFE_V2_VERSIONS\.has\(health\.version\)/);
  const dualWriteStart=apiSource.indexOf('async function dualWrite');
  const handlerStart=apiSource.indexOf('module.exports',dualWriteStart);
  const dualWrite=apiSource.slice(dualWriteStart,handlerStart);
  assert.doesNotMatch(dualWrite,/for\s*\([^)]*attempt/);
  assert.doesNotMatch(dualWrite,/\bretry\s*\(/i);
});
