'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=()=>fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const css=()=>fs.readFileSync(path.join(root,'public','po-feature.css'),'utf8');

test('sidebar navigation uses keyboard-focusable buttons with current-page semantics',()=>{
  const source=html();
  const nav=source.match(/<div class="topbar-nav">[\s\S]*?<\/div>\s*<div class="sidebar-footer">/)?.[0]||'';
  for(const page of ['dashboard','search','summary','entry','restock','settings']){
    assert.match(nav,new RegExp(`<button[^>]+class="nav-item(?: active)?"[^>]+data-page="${page}"[^>]+onclick="navigate\\('${page}'\\)"`,'i'));
  }
  assert.doesNotMatch(nav,/<div class="nav-item/);
  assert.match(source,/setAttribute\('aria-current',\s*isActive\s*\?\s*'page'\s*:\s*'false'\)/);
});

test('late responsive overrides keep tablet content beside the sidebar and start mobile with a closed drawer',()=>{
  const styles=css();
  assert.match(styles,/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?body\s*\{[^}]*display:\s*flex\s*!important[^}]*overflow:\s*hidden\s*!important[\s\S]*?#sidebar\s*\{[^}]*height:\s*100vh\s*!important[\s\S]*?#main\s*\{[^}]*width:\s*calc\(100vw\s*-\s*180px\)/i);
  assert.match(styles,/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?body\s*\{[^}]*display:\s*block\s*!important[^}]*overflow:\s*hidden\s*!important[\s\S]*?#main\s*\{[^}]*width:\s*100vw\s*!important/i);
  assert.match(styles,/#content,#sidebar\.collapsed~#main #content\s*\{[^}]*width:\s*100%\s*!important/i);
  assert.match(styles,/#sidebarToggle,\.sidebar-close-control\s*\{[^}]*width:\s*40px\s*!important[^}]*height:\s*40px\s*!important/i);
  assert.match(html(),/if\s*\(window\.innerWidth\s*<=\s*767\)\s*closeSidebar\(false\)/);
});

test('New Entry keeps Case before Pack and exposes persistent accessible validation',()=>{
  const source=html();
  const table=source.match(/<table id="entryRecentTable"[\s\S]*?<\/table>/)?.[0]||'';
  assert.ok(table.indexOf('Order Case Qty') < table.indexOf('Order Pack Qty'));
  const render=source.slice(source.indexOf('function renderEntryRecent()'),source.indexOf('function renderTopProducts()'));
  assert.ok(render.indexOf('(r.cases || 0)') < render.indexOf('(r.packs || 0)'));
  assert.match(source,/id="entryValidationSummary"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(source,/function getEntryValidationState\s*\(/);
  assert.match(source,/function updateEntrySubmitState\s*\(/);
  assert.match(source,/firstInvalid\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  assert.match(source,/setAttribute\('aria-invalid',\s*'true'\)/);
  assert.match(source,/entrySubmitButton"[^>]+disabled/);
});

test('Restock has a truthful live addition preview and validity-bound submit state',()=>{
  const source=html();
  assert.match(source,/class="restock-impact"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(source,/id="restockValidationSummary"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(source,/id="restockSubmit"[^>]+disabled/);
  assert.match(source,/function updateRestockLineImpact\s*\(/);
  assert.match(source,/function updateRestockSubmitState\s*\(/);
  assert.match(source,/This restock adds/);
  assert.doesNotMatch(source,/Current stock|After restock/);
  assert.doesNotMatch(source,/\.restock-packs'\)\.value\s*=\s*cases\s*\*\s*packsPerCase/);
  assert.match(source,/Number\(cases\?\.value\)\s*<\s*0/);
});

test('remaining audit polish is implemented without mutating authoritative data',()=>{
  const source=html();
  const styles=css();
  assert.match(styles,/#page-search \.search-primary-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i);
  assert.match(source,/id="searchScrollCue"/);
  assert.match(source,/function updateSearchScrollCue\s*\(/);
  assert.match(source,/function expandSummaryItemLabel_\s*\(/);
  assert.match(source,/aria-label="\$\{summaryEscapeHtml_\(expandedLabel\)\}"/);
  assert.match(source,/id="priceRefFilter"[^>]+oninput="filterPriceReference\(this\.value\)"/);
  assert.match(source,/function filterPriceReference\s*\(/);
  assert.match(source,/aria-label="Remove \$\{summaryEscapeHtml_\(b\)\}"/);
  assert.match(source,/window\.confirm\(`Remove buyer "\$\{buyer\}" from this browser\?`\)/);
  assert.match(source,/class="buyer-overview-details"/);
  assert.doesNotMatch(source,/FAST LOGISITCS CORPORATION/);
});

test('browser and Sheet-originated labels are rendered as text rather than executable markup',()=>{
  const source=html();
  assert.match(source,/function showToast\(msg,type='info'\)\{[\s\S]*?message\.textContent=String\(msg\|\|''\)/);
  assert.doesNotMatch(source,/toast\.innerHTML=`<span>\$\{icons\[type\]/);
  assert.match(source,/<td>\$\{summaryEscapeHtml_\(displayProductName\(r\.product\)\)\}<\/td>/);
  assert.match(source,/summaryEscapeHtml_\(r\.buyer\|\|'—'\)/);
  assert.match(source,/poValues\.map\(summaryEscapeHtml_\)\.join\('<br>'\)/);
  assert.match(source,/summaryEscapeHtml_\(shortProduct\(item\.product\)\)/);
});
