'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const html=()=>fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const css=()=>fs.readFileSync(path.join(root,'public','po-feature.css'),'utf8');

test('sidebar footer is a full-width two-segment MARU and BUYER switch with no caption or arrows',()=>{
  const s=html();
  const styles=css();
  const footer=s.match(/<div class="sidebar-footer"[\s\S]*?<\/div>\s*<\/nav>/i)?.[0]||'';
  assert.match(footer,/id="portalViewModeToggle"/);
  assert.match(footer,/data-mode-option="maru"/);
  assert.match(footer,/data-mode-option="buyer"/);
  assert.doesNotMatch(footer,/portal-mode-caption|portal-mode-arrow|Portal view/i);
  assert.match(styles,/#sidebar \.sidebar-footer\s*\{[^}]*width:\s*215px\s*!important[^}]*padding:\s*0\s*!important[^}]*border-top:\s*0\s*!important/is);
  assert.match(styles,/\.portal-mode-toggle\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)\s*!important/is);
  assert.match(styles,/\.portal-mode-option\s*\+\s*\.portal-mode-option\s*\{[^}]*border-left:/is);
  assert.match(s,/const PORTAL_VIEW_MODE_KEY\s*=\s*'maruWarehousePortalViewMode'/);
  assert.match(s,/function setPortalViewMode\s*\(/);
  assert.match(s,/document\.documentElement\.dataset\.portalView\s*=\s*portalViewMode/);
  assert.match(s,/localStorage\.setItem\(PORTAL_VIEW_MODE_KEY,portalViewMode\)/);
  assert.match(s,/setPortalViewMode\(portalViewMode==='buyer'\?'maru':'buyer'\)/);
});

test('BUYER view hides every requested internal financial surface and rebalances visible content',()=>{
  const s=html();
  const styles=s+css();
  assert.match(s,/id="dashboardProfitSignal"[^>]*class="[^"]*buyer-private/);
  assert.match(s,/id="monthlyProfitCard"[^>]*class="[^"]*buyer-private/);
  assert.match(s,/class="hero-metric buyer-private"[\s\S]*?Profit/);
  assert.match(s,/class="hero-metric buyer-private"[\s\S]*?Margin/);
  assert.match(styles,/html\[data-portal-view="buyer"\] \.buyer-private\s*\{[^}]*display:\s*none\s*!important/i);
  assert.match(styles,/html\[data-portal-view="buyer"\] #summaryTable :is\(th,td\):nth-child\(8\)/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #summaryTable :is\(th,td\):nth-child\(9\)/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #summaryTable :is\(th,td\):nth-child\(10\)/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #searchResultsTable :is\(th,td\):nth-child\(10\)/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #searchResultsTable :is\(th,td\):nth-child\(11\)/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #entryRecentTable :is\(th,td\):nth-child\(10\)/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #entryRecentTable :is\(th,td\):nth-child\(11\)/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #searchSummary \.is-cost/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #searchSummary \.is-net/);
  assert.match(styles,/html\[data-portal-view="buyer"\] #searchSummary\s*\{[^}]*grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)/i);
  assert.match(styles,/html\[data-portal-view="buyer"\] #overviewStats\s*\{[^}]*grid-template-columns:\s*1fr/i);
});

test('BUYER top-products chart excludes profit while both views show only five products',()=>{
  const s=html();
  assert.match(s,/\.slice\(0,\s*5\)/);
  assert.match(s,/const topProductDatasets\s*=\s*\[revenueDataset\]/);
  assert.match(s,/if\s*\(portalViewMode\s*!==\s*'buyer'\)\s*topProductDatasets\.push\(profitDataset\)/);
  assert.match(s,/data:\s*\{\s*labels,\s*datasets:\s*topProductDatasets\s*\}/);
  assert.match(s,/portalViewMode==='buyer'[\s\S]*?Revenue[\s\S]*?:[\s\S]*?Profit/);
  assert.match(s,/portalViewMode\s*===\s*'buyer'[\s\S]*?Horizontal bar chart showing revenue for the top five products[\s\S]*?Horizontal bar chart showing revenue and profit for the top five products/);
  const topProductsFn=s.slice(s.indexOf('function renderTopProducts()'),s.indexOf('function renderAllData()'));
  assert.ok(topProductsFn.indexOf("const canvas = document.getElementById('topProductsChart')") < topProductsFn.indexOf('if (!sorted.length)'), 'mode relabel and stale-chart cleanup must run before the empty-data return');
  assert.match(topProductsFn,/window\._topProductsChartInstance\.destroy\(\);\s*window\._topProductsChartInstance\s*=\s*null/);
});

test('House-style quantity steppers wrap case and pack fields and clamp at each input minimum',()=>{
  const s=html()+css();
  assert.match(s,/class="qty-stepper"[\s\S]*?class="form-control entry-cases"[\s\S]*?data-entry-qty-step="up"[\s\S]*?data-entry-qty-step="down"/);
  assert.match(s,/class="qty-stepper"[\s\S]*?class="form-control entry-packs"[\s\S]*?data-entry-qty-step="up"[\s\S]*?data-entry-qty-step="down"/);
  assert.match(s,/class="qty-stepper"[\s\S]*?class="form-control restock-cases"[\s\S]*?data-restock-qty-step="up"[\s\S]*?data-restock-qty-step="down"/);
  assert.match(s,/class="qty-stepper"[\s\S]*?class="form-control restock-packs"[\s\S]*?data-restock-qty-step="up"[\s\S]*?data-restock-qty-step="down"/);
  assert.match(s,/function stepQuantityInput\s*\(button,direction\)/);
  assert.match(s,/Math\.max\(minimum,current\+delta\)/);
  assert.match(s,/input\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
  assert.match(s,/\.qty-stepper\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)\s*34px/i);
  assert.match(s,/\.qty-step-buttons\s*\{[^}]*grid-template-rows:\s*1fr\s*1fr/i);
  assert.match(s,/\.qty-step-button\s*\{[^}]*min-height:\s*24px\s*!important/i);
  assert.match(s,/\.qty-step-button:first-child::before/);
  assert.match(s,/\.qty-step-button:last-child::before/);
});

test('empty BUYER transition destroys stale MARU profit chart and legend',()=>{
  const s=html();
  const fn=s.slice(s.indexOf('function renderTopProducts()'),s.indexOf('function renderAllData()'));
  const elements={
    topProductsChart:{label:'',setAttribute(name,value){if(name==='aria-label')this.label=value;}},
    topProductsSummary:{innerHTML:''},
    topProductsLegend:{innerHTML:''},
  };
  let destroyed=false;
  function Chart(_canvas,config){this.data=config.data;this.destroy=()=>{destroyed=true;};}
  Chart.defaults={font:{}};
  const context={
    allData:[{date:'08/24/2026',product:'Wet Wipes 60s Fluffy',total:1000}],
    portalViewMode:'maru',
    parseLooseDate:()=>new Date('2026-08-24'),
    displayProductName:value=>value,
    getRowCost:()=>100,
    document:{getElementById:id=>elements[id]||null},
    window:{_topProductsChartInstance:null},
    Chart,
    getComputedStyle:()=>({getPropertyValue:()=>''}),
  };
  vm.createContext(context);
  vm.runInContext(fn,context);
  context.renderTopProducts();
  assert.deepEqual(Array.from(context.window._topProductsChartInstance.data.datasets,d=>d.label),['Revenue','Profit']);
  assert.match(elements.topProductsLegend.innerHTML,/Profit/);

  context.allData=[];
  context.portalViewMode='buyer';
  context.renderTopProducts();
  assert.equal(destroyed,true);
  assert.equal(context.window._topProductsChartInstance,null);
  assert.doesNotMatch(elements.topProductsLegend.innerHTML,/Profit/);
  assert.doesNotMatch(elements.topProductsChart.label,/profit/i);
});
