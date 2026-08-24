'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const publicDir=path.resolve(__dirname,'..','public');
const html=()=>fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
const css=()=>fs.readFileSync(path.join(publicDir,'po-feature.css'),'utf8');

test('Search Summary titles align identically while MARU and BUYER currency values use mode-fit sizes',()=>{
  const s=html();
  const styles=s+css();
  assert.match(styles,/#page-search \.search-summary-item\s*\{[^}]*grid-template-rows:\s*16px 40px\s*!important[^}]*align-content:\s*center\s*!important/i);
  assert.match(styles,/#page-search \.search-summary-item span\s*\{[^}]*font-size:\s*13px\s*!important[^}]*line-height:\s*16px\s*!important/i);
  assert.match(styles,/#page-search \.search-summary-item\.is-currency span\s*\{[^}]*margin-left:\s*0\s*!important/i);
  assert.match(styles,/#page-search \.search-summary-item strong\s*\{[^}]*height:\s*40px\s*!important[^}]*line-height:\s*40px\s*!important/i);
  assert.match(styles,/#page-search \.search-summary-item\.is-currency strong\s*\{[^}]*font-size:\s*clamp\(15px,\s*1\.2vw,\s*18px\)\s*!important/i);
  assert.match(styles,/html\[data-portal-view="buyer"\] #searchSummary \.search-summary-item\.is-total strong\s*\{[^}]*font-size:\s*clamp\(22px,\s*1\.55vw,\s*28px\)\s*!important/i);
  const initialSummary=s.match(/<div class="search-summary-grid" id="searchSummary">([\s\S]*?)<\/div>\s*<div class="search-summary-products"/i)?.[1]||'';
  assert.match(initialSummary,/class="search-summary-item is-total is-currency"/);
  assert.match(initialSummary,/class="search-summary-item is-cost is-currency"/);
  assert.match(initialSummary,/class="search-summary-item is-net is-currency"/);
  assert.match(s,/class="search-summary-item is-total is-currency"/);
  assert.match(s,/class="search-summary-item is-cost is-currency"/);
  assert.match(s,/class="search-summary-item is-net is-currency"/);
});

test('Search uses compact Select Product rows and hash-style order placeholders',()=>{
  const s=html();
  assert.match(s,/id="s-po" placeholder="Purchase Order #"/);
  assert.match(s,/id="s-si" placeholder="Sales Invoice #"/);
  assert.match(s,/<span class="form-label">Select Product<\/span>/);
  assert.match(s,/aria-label="Select Product filter"><option value="">Select Product<\/option>/);
  assert.doesNotMatch(s,/search-product-remove"[^>]*hidden/);
  assert.match(s,/button\.hidden\s*=\s*false/);
  assert.doesNotMatch(s,/button\.hidden\s*=\s*rows\.length\s*<=\s*1/);
});

test('Authoritative Summary restores Plush yellow and Fluffy blue item badges',()=>{
  const s=html();
  assert.match(s,/const AUTHORITATIVE_SUMMARY_PLUSH_CODES\s*=\s*new Set\(\['PBT','PKT','PPT','PWW'\]\)/);
  assert.match(s,/function authoritativeSummaryItemBadge_\(item\)/);
  assert.match(s,/AUTHORITATIVE_SUMMARY_PLUSH_CODES\.has\(code\)\s*\?\s*'badge-plush'\s*:\s*'badge-fluffy'/);
  assert.match(s,/itemNames\.map\(item=>`<span class="badge \$\{authoritativeSummaryItemBadge_\(item\)\}"/);
  assert.doesNotMatch(s,/itemNames\.map\(item=>`<span class="badge badge-fluffy"/);
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
  assert.match(css(),/#page-summary \.summary-selection-toolbar\s*\{[^}]*border:\s*1px solid var\(--border\)\s*!important/i);
  assert.match(css(),/#page-summary #summaryTable tbody td:first-child\s*\{[^}]*border-left:\s*1px solid var\(--border\)\s*!important/i);
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

test('Summary PDF ends with a right-aligned grand total',()=>{
  const reportSource=fs.readFileSync(path.join(publicDir,'summary-report.js'),'utf8');
  assert.match(reportSource,/const grandTotal=data\.reduce/);
  assert.match(reportSource,/drawText\('GRAND TOTAL'/);
  assert.match(reportSource,/money\(grandTotal\)/);
});

test('Summary PDF controls stay visible while scrolling and preview uses nearly all viewport',()=>{
  const s=html();

  assert.match(s,/#page-summary \.summary-terminal-wrap\s*\{[\s\S]*?max-height:\s*calc\(100vh\s*-\s*\d+px\)[\s\S]*?overflow-y:\s*auto[\s\S]*?scrollbar-gutter:\s*stable/);
  assert.match(s,/#page-summary #summaryTable thead th\{position:sticky!important;top:0!important;z-index:4!important/);
  assert.match(s,/#summaryTable th:nth-child\(13\)\{width:3%!important\}/);
  assert.match(s,/<colgroup>\s*<col style="width:3%"><col style="width:10%"><col style="width:12%"><col style="width:9%"><col style="width:8%">\s*<col style="width:12%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:10%">\s*<col style="width:3%"><col style="width:3%"><col style="width:3%">\s*<\/colgroup>/);
  assert.match(s,/#summaryTable th:nth-child\(6\),#summaryTable td:nth-child\(6\) \{ width: 12%; \}/);
  assert.match(s,/#summaryTable th:nth-child\(4\),#summaryTable td:nth-child\(4\) \{ width: 9%; \}/);
  assert.match(s,/#summaryTable th:nth-child\(5\),#summaryTable td:nth-child\(5\) \{ width: 8%; \}/);
  assert.match(s,/#summaryTable th:nth-child\(3\)\{width:12%!important\}/);
  assert.match(s,/#summaryTable th:nth-child\(4\)\{width:9%!important\}/);
  assert.match(s,/#summaryTable th:nth-child\(5\)\{width:8%!important\}/);
  assert.match(s,/#summaryTable th:nth-child\(6\)\{width:12%!important\}/);
  assert.match(s,/#summaryTable th:nth-child\(7\)\{width:9%!important\}/);
  assert.doesNotMatch(s,/#summaryTable th:nth-child\(6\)\{width:22%!important\}/);
  const poCss=fs.readFileSync(path.resolve(__dirname,'..','public','po-feature.css'),'utf8');
  assert.match(poCss,/#page-summary #summaryTable th:nth-child\(4\),#page-summary #summaryTable td:nth-child\(4\)\{width:9%!important\}/);
  assert.match(poCss,/#page-summary #summaryTable th:nth-child\(5\),#page-summary #summaryTable td:nth-child\(5\)\{width:8%!important\}/);
  assert.match(poCss,/#page-summary #summaryTable th:nth-child\(6\),#page-summary #summaryTable td:nth-child\(6\)\{width:12%!important\}/);
  assert.match(poCss,/#page-summary #summaryTable th:nth-child\(7\),#page-summary #summaryTable td:nth-child\(7\)\{width:9%!important\}/);
  assert.match(poCss,/#page-summary \.summary-selection-toolbar\s*\{[\s\S]*?position:\s*relative!important[\s\S]*?top:\s*auto!important/);
  assert.match(poCss,/#page-summary #summaryTable thead\s*\{[\s\S]*position:\s*sticky!important[\s\S]*background:\s*#0c0f10!important/i);
  assert.match(poCss,/#page-summary \.summary-terminal-card\s*\{[\s\S]*border-left:\s*0!important[\s\S]*border-right:\s*0!important/i);
  assert.match(poCss,/#page-summary #summaryTable thead th\s*\{[\s\S]*background:\s*#0c0f10!important/i);
  assert.match(s,/\.summary-pdf-modal\s*\{[\s\S]*?padding:\s*8px/);
  assert.match(s,/\.summary-pdf-dialog\s*\{[\s\S]*?width:\s*calc\(100vw\s*-\s*16px\)[\s\S]*?height:\s*calc\(100vh\s*-\s*16px\)/);
});

test('Summary grouping removes buyer duplicates caused only by whitespace',()=>{
  const s=html();
  assert.match(s,/function normalizeSummaryBuyerNames_\s*\(/);
  assert.match(s,/replace\(\/\\s\+\/g,' '\)/);
  assert.match(s,/buyerNames\s*=\s*normalizeSummaryBuyerNames_\(Array\.from\(group\.buyers\)\)/);
});

test('Portal Summary renders authoritative SUMMARY sheet rows instead of rebuilding edited identities from ORDER LINES',()=>{
  const s=html();
  assert.match(s,/let summaryData = \[\]/);
  assert.match(s,/summaryData\s*=\s*\(json\.summary\s*\|\|\s*\[\]\)\.map/);
  assert.match(s,/function buildAuthoritativeSummaryRows\s*\(/);
  assert.match(s,/if \(summaryData\.length\) return buildAuthoritativeSummaryRows\(\)/);
  assert.match(s,/const due = item\.due \|\| formatDueDate/);
});
