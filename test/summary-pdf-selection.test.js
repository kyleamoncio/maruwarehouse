'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const publicDir=path.resolve(__dirname,'..','public');
const html=()=>fs.readFileSync(path.join(publicDir,'index.html'),'utf8');

test('Search Summary headings are larger while currency values use a fit-safe size',()=>{
  const s=html();
  assert.match(s,/\.search-summary-item span\s*\{[\s\S]*?font-size:\s*13px/);
  assert.match(s,/\.search-summary-item\.is-currency\s*\{[\s\S]*?padding-left:\s*12px[\s\S]*?padding-right:\s*12px/);
  assert.match(s,/\.search-summary-item\.is-currency strong\s*\{[\s\S]*?font-size:\s*clamp\(12px,\s*1vw,\s*16px\)/);
  assert.match(s,/#page-search \.search-summary-item:not\(\.is-currency\) strong/);
  assert.match(s,/#page-search \.search-summary-item span\{font-size:13px!important/);
  assert.match(s,/class="search-summary-item is-total is-currency"/);
  assert.match(s,/class="search-summary-item is-cost is-currency"/);
  assert.match(s,/class="search-summary-item is-net is-currency"/);
});

test('Summary rows support multi-selection and PDF preview/download controls',()=>{
  const s=html();
  assert.match(s,/id="summarySelectionCount"/);
  assert.match(s,/id="summaryPreviewPdf"/);
  assert.match(s,/id="summaryDownloadPdf"/);
  assert.match(s,/id="summarySelectAll"/);
  assert.match(s,/class="summary-row-select"/);
  assert.match(s,/const summarySelectedKeys = new Set\(\)/);
  assert.match(s,/window\.SummaryReport\.preview/);
  assert.match(s,/window\.SummaryReport\.download/);
  assert.match(s,/colspan="13"/);
  assert.match(s,/src="\/pdf-lib\.min\.js"/);
  assert.match(s,/src="\/summary-report\.js"/);
});

test('PDF report model includes balanced business fields but excludes due by, cost, and net total',async()=>{
  const report=require(path.join(publicDir,'summary-report.js'));
  assert.deepEqual(report.SUMMARY_REPORT_COLUMNS.map(column=>column.key),['date','buyers','po','si','items','total']);
  const model=report.normalizeRows([{date:'August 11, 2026',buyerText:'WATSONS',poText:'123',siText:'456',itemText:'Plush Wet Wipes 60s (12 packs)',total:2330.9,due:'October 11, 2026',cost:319.2,netTotal:2011.7}]);
  assert.equal(model.length,1);
  assert.equal(Object.hasOwn(model[0],'due'),false);
  assert.equal(Object.hasOwn(model[0],'cost'),false);
  assert.equal(Object.hasOwn(model[0],'netTotal'),false);
  const bytes=await report.buildPdfBytes(model,{generatedAt:new Date('2026-08-11T00:00:00Z')});
  assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');
  const {PDFDocument}=require('pdf-lib');
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1);
});

test('Summary PDF is plain white, uses only MARU Sales Summary, and omits subtitle/page labels',()=>{
  const reportSource=fs.readFileSync(path.join(publicDir,'summary-report.js'),'utf8');
  assert.match(reportSource,/drawText\('MARU Sales Summary'/);
  assert.doesNotMatch(reportSource,/selected row|Generated|Page \$\{|index%2/);
});

test('Summary PDF controls stay visible while scrolling and preview uses nearly all viewport',()=>{
  const s=html();
  assert.match(s,/\.summary-selection-toolbar\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*\d+px[\s\S]*?z-index:/);
  assert.match(s,/#page-summary \.summary-terminal-wrap\s*\{[\s\S]*?max-height:\s*calc\(100vh\s*-\s*\d+px\)[\s\S]*?overflow-y:\s*auto[\s\S]*?scrollbar-gutter:\s*stable/);
  assert.match(s,/\.summary-pdf-modal\s*\{[\s\S]*?padding:\s*8px/);
  assert.match(s,/\.summary-pdf-dialog\s*\{[\s\S]*?width:\s*calc\(100vw\s*-\s*16px\)[\s\S]*?height:\s*calc\(100vh\s*-\s*16px\)/);
});
