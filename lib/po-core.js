(function initPoCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarehousePOCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function poCoreFactory() {
  'use strict';

  class UnsupportedProfileError extends Error {
    constructor(profile) {
      super(`${profile || 'Unknown'} PO format is not supported in the Watsons MVP.`);
      this.name = 'UnsupportedProfileError';
      this.profile = profile || 'UNKNOWN';
    }
  }

  const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const normalize = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const numberFrom = value => Number(String(value || '').replace(/,/g, '').trim()) || 0;

  function detectCustomerProfile(text, filename = '') {
    const haystack = `${filename}\n${text}`.toUpperCase();
    if (/WATSONS|A\.S\.\s*WATSON/.test(haystack)) return 'WATSONS';
    if (/SM\s+(MARKETS|HYPERMARKET|SUPERMARKET)|SM\s+RETAIL|SUPER\s+SHOPPING\s+MARKET/.test(haystack)) return 'SM';
    return 'UNKNOWN';
  }

  function linesBetween(lines, startPattern, endPattern) {
    const start = lines.findIndex(line => startPattern.test(line));
    if (start < 0) return [];
    const tail = lines.slice(start + 1);
    const end = tail.findIndex(line => endPattern.test(line));
    return end < 0 ? tail : tail.slice(0, end);
  }

  function valueAfter(lines, labelPattern, maxDistance = 2) {
    const index = lines.findIndex(line => labelPattern.test(line));
    if (index < 0) return '';
    for (let offset = 1; offset <= maxDistance && index + offset < lines.length; offset += 1) {
      const candidate = lines[index + offset].trim();
      if (candidate && !/:$/.test(candidate)) return candidate;
    }
    return '';
  }

  function isoDate(value) {
    const text = String(value || '').trim();
    const monthNames = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
    let match = text.match(/^(\d{1,2})[-/]([A-Z]{3}|\d{1,2})[-/](\d{2,4})$/i);
    if (!match) return '';
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const month = /^\d+$/.test(match[2]) ? Number(match[2]) : monthNames[match[2].toUpperCase()];
    if (!month || Number(match[1]) < 1 || Number(match[1]) > 31) return '';
    return `${year}-${String(month).padStart(2,'0')}-${String(Number(match[1])).padStart(2,'0')}`;
  }

  function parseWatsons(text, metadata = {}) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const skuValues = linesBetween(lines, /^PAGE\s+\d+/i, /^SKU$/i).filter(line => /^\d{8}$/.test(line));
    const quantities = linesBetween(lines, /^UPC$/i, /^TOTAL:/i)
      .filter(line => /^\d+(?:\.\d+)?$/.test(line.replace(/,/g,'')))
      .slice(0, skuValues.length).map(numberFrom);
    const lineAmounts = linesBetween(lines, /^UPC$/i, /^TOTAL:/i)
      .filter(line => /^\d{1,3}(?:,\d{3})+\.\d{4}$/.test(line) || /^\d+\.\d{4}$/.test(line))
      .slice(0, skuValues.length).map(numberFrom);
    const descriptions = linesBetween(lines, /^\d{1,3}(?:,\d{3})*\.\d{4}$/i, /^TOTAL:/i)
      .filter(line => !/^\d{1,3}(?:,\d{3})*\.\d{4}$/.test(line));
    const unitPrices = linesBetween(lines, /^EXT\. COST$/i, /^EA$/i)
      .filter(line => /^\d{1,3}(?:,\d{3})*\.\d{4}$/.test(line))
      .slice(0, skuValues.length).map(numberFrom);
    const uoms = linesBetween(lines, /^BUY\s*U\/M$/i, /^DATE:$/i).filter(line => /^(CASE|PACK|EA|UNIT)$/i.test(line));
    const totalIndex = lines.findIndex(line => /^TOTAL:$/i.test(line));
    const poTotal = totalIndex >= 0 ? numberFrom(lines[totalIndex + 1]) : 0;
    const poLabel = lines.findIndex(line => /^PO NUMBER:$/i.test(line));
    const poNumber = poLabel > 0
      ? lines.slice(Math.max(0, poLabel - 12), poLabel).reverse().find(line => /^\d{6,}$/.test(line)) || ''
      : (String(metadata.sourceFilename || '').match(/PO(\d{6,})/i) || [,''])[1];
    const company = valueAfter(lines, /^COMPANY NAME:$/i);
    const branch = valueAfter(lines, /^LOCATION:$/i);
    const branchIndex = lines.findIndex(line => /^LOCATION:$/i.test(line));
    const deliveryAddress = branchIndex >= 0 ? [lines[branchIndex + 1], lines[branchIndex + 2]].filter(Boolean).join(', ') : '';
    const rawDescriptions = [
      descriptions.slice(0,2).join(' '),
      descriptions.slice(2,4).join(' '),
      descriptions[4] || '',
      descriptions.slice(5).join(' ')
    ].slice(0, skuValues.length);
    const linesOut = skuValues.map((article, index) => ({
      customerArticleNumber: article,
      customerDescription: rawDescriptions[index] || '',
      poQuantity: quantities[index] || 0,
      poUnit: (uoms[index] || 'CASE').toUpperCase(),
      unitPrice: unitPrices[index] || 0,
      discount: 0,
      lineAmount: lineAmounts[index] || 0,
      confidence: lineAmounts[index] && quantities[index] && unitPrices[index] ? 0.98 : 0.55
    }));
    return {
      profile:'WATSONS', customerCode:'WATSONS', customerName:company || 'WATSONS PERSONALCARE',
      branch, poNumber, poDate:isoDate(valueAfter(lines,/^ENTRY DATE:$/i)),
      requiredDeliveryDate:isoDate(valueAfter(lines,/^EXPECTED RECEIPT DATE/i)),
      paymentTerms:valueAfter(lines,/^TERMS\s*&\s*DISCOUNTS:$/i), deliveryAddress,
      tin:'', currency:'PHP', vatTreatment:'VAT_INCLUSIVE', poTotal:money(poTotal),
      sourceFilename:String(metadata.sourceFilename || ''), lines:linesOut,
      extraction:{method:'NATIVE_TEXT',confidence: linesOut.length && poNumber ? 0.96 : 0.55,originalText:String(text || '')}
    };
  }

  function parseSm(text, metadata = {}) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const dates = lines.filter(line => /^\d{2}\/\d{2}\/\d{4}$/.test(line)).slice(0,3);
    const poNumber = lines.find(line => /^\d{10}$/.test(line)) || '';
    const seen = new Set();
    const linesOut = [];
    lines.forEach((line,index) => {
      if (!/^20\d{6}$/.test(line) || seen.has(line)) return;
      const unitPrice = numberFrom(lines[index - 2]);
      const poQuantity = numberFrom(lines[index - 1]);
      if (!(unitPrice > 0) || !(poQuantity > 0)) return;
      seen.add(line);
      const description = [];
      for (let cursor=index + 6; cursor < lines.length && !/^PRE PACK$/i.test(lines[cursor]); cursor += 1) {
        if (/^(?:PAGE|VAT REG|PURCHASE ORDER)/i.test(lines[cursor])) break;
        description.push(lines[cursor]);
      }
      linesOut.push({
        customerArticleNumber:line,
        customerDescription:description.join(' ').replace(/_/g,' ').replace(/\s+/g,' ').trim(),
        poQuantity,
        poUnit:/^(CS|CASE)$/i.test(lines[index + 1] || '') ? 'CASE' : String(lines[index + 1] || 'CASE').toUpperCase(),
        unitPrice:money(unitPrice),
        discount:0,
        lineAmount:money(poQuantity * unitPrice),
        confidence:0.97
      });
    });
    const totalIndex = lines.findIndex(line => /^TOTAL:$/i.test(line));
    let poTotal = 0;
    if (totalIndex >= 0) {
      for (let index=totalIndex - 1; index >= Math.max(0,totalIndex - 5); index -= 1) {
        if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(lines[index])) { poTotal=numberFrom(lines[index]); break; }
      }
    }
    const tinLine = lines.find(line => /^VAT REG TIN\s+/i.test(line)) || '';
    const branch = lines.find(line => /^\d{4}\s+SSM\s+/i.test(line)) || '';
    const deliveryAddress = lines.find(line => /ASINAN GLOBAL AIRPORT/i.test(line)) || '';
    const smDate = value => {
      const match=String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return match ? `${match[3]}-${match[1]}-${match[2]}` : '';
    };
    return {
      profile:'SM', customerCode:'SM', customerName:'SUPER SHOPPING MARKET, INC.', branch,
      poNumber, poDate:smDate(dates[0]), requiredDeliveryDate:smDate(dates[1]),
      paymentTerms:lines.find(line => /^\d+\s+DAYS?\s+DUE\s+NET$/i.test(line)) || '30 Days Due Net',
      deliveryAddress, tin:tinLine.replace(/^VAT REG TIN\s*/i,''), currency:'PHP',
      vatTreatment:'VAT_INCLUSIVE', poTotal:money(poTotal), sourceFilename:String(metadata.sourceFilename || ''),
      lines:linesOut,
      extraction:{method:'NATIVE_TEXT',confidence:linesOut.length && poNumber ? 0.95 : 0.55,originalText:String(text || '')}
    };
  }

  function parsePurchaseOrder(text, metadata = {}) {
    const profile = detectCustomerProfile(text, metadata.sourceFilename);
    if (profile === 'WATSONS') return parseWatsons(text, metadata);
    if (profile === 'SM') return parseSm(text, metadata);
    throw new UnsupportedProfileError(profile);
  }

  function validateExtractedPo(value) {
    const issues = [];
    if (!value || typeof value !== 'object') return {success:false,issues:[{path:'',message:'PO data is required.'}]};
    if (!String(value.customerCode || '').trim()) issues.push({path:'customerCode',message:'Customer is required.'});
    if (!String(value.poNumber || '').trim()) issues.push({path:'poNumber',message:'PO number is required.'});
    if (!Array.isArray(value.lines) || !value.lines.length) issues.push({path:'lines',message:'At least one line item is required.'});
    (value.lines || []).forEach((line,index) => {
      if (!(Number(line.poQuantity) > 0)) issues.push({path:`lines.${index}.poQuantity`,message:'Quantity must be greater than zero.'});
      if (!String(line.customerArticleNumber || line.customerDescription || '').trim()) issues.push({path:`lines.${index}`,message:'Article number or description is required.'});
    });
    return {success:issues.length === 0,data:value,issues};
  }

  function matchMapping(line, mappings, customerCode) {
    const active = (mappings || []).filter(mapping => mapping.active !== false && normalize(mapping.customerCode) === normalize(customerCode));
    const selectedId = String(line.mappingId || '').trim();
    const selected = selectedId && active.find(mapping => String(mapping.id || '').trim() === selectedId);
    if (selected) return {mapping:selected,matchMethod:'REVIEW',confidence:1};
    const article = String(line.customerArticleNumber || '').trim();
    const exact = active.find(mapping => String(mapping.customerArticleNumber || '').trim() === article);
    if (exact) return {mapping:exact,matchMethod:'ARTICLE',confidence:1};
    const description = normalize(line.customerDescription);
    const byDescription = active.find(mapping => normalize(mapping.customerProductDescription) === description || normalize(mapping.invoiceDescription) === description);
    return byDescription ? {mapping:byDescription,matchMethod:'DESCRIPTION',confidence:0.8} : null;
  }

  function calculateTotals(lines, poTotal = 0, tolerance = 0.01) {
    let grossCents = 0;
    let vatCents = 0;
    (lines || []).forEach(line => {
      const amountCents = Math.round(Number(line.calculatedAmount || 0) * 100);
      grossCents += amountCents;
      if (String(line.vatTreatment || '').toUpperCase() === 'VAT_INCLUSIVE') {
        const netCents = Math.round(amountCents / 1.12);
        vatCents += amountCents - netCents;
      }
    });
    const poCents = Math.round(Number(poTotal || 0) * 100);
    const differenceCents = grossCents - poCents;
    return {
      gross:grossCents / 100, vat:vatCents / 100, netOfVat:(grossCents - vatCents) / 100,
      poTotal:poCents / 100, poDifference:differenceCents / 100,
      poMatches:poCents === 0 ? true : Math.abs(differenceCents) <= Math.round(Math.abs(Number(tolerance)||0)*100)
    };
  }

  function applyMappingsAndCalculate(po, mappings) {
    const customerCode = String(po.customerCode || '');
    const lines = (po.lines || []).map(line => {
      const match = matchMapping(line,mappings,customerCode);
      if (!match) return {...line,matched:false,physicalCartons:0,sellingQuantity:0,calculatedAmount:0};
      const mapping = match.mapping;
      const poQuantity = Number(line.poQuantity) || 0;
      const packsPerPoCase = Number(mapping.packsPerPoCase) || 0;
      const packsPerPhysicalCarton = Number(mapping.packsPerPhysicalCarton) || 0;
      const sellingQuantity = String(line.poUnit || mapping.poUnit).toUpperCase() === 'CASE' ? poQuantity * packsPerPoCase : poQuantity;
      const physicalCartons = packsPerPhysicalCarton > 0 ? sellingQuantity / packsPerPhysicalCarton : 0;
      const poDisplayUnitPrice = money(line.unitPrice || 0);
      const poLineAmount = money(line.lineAmount || 0);
      const effectivePackPrice = sellingQuantity > 0 && poLineAmount > 0 ? money(poLineAmount / sellingQuantity) : 0;
      return {
        ...line, matched:true, matchMethod:match.matchMethod, mappingId:mapping.id || '',
        internalSku:mapping.internalSku, internalProductName:mapping.internalProductName,
        invoiceDescription:mapping.invoiceDescription || mapping.internalProductName,
        drDescription:mapping.drDescription || mapping.invoiceDescription || mapping.internalProductName,
        sellingUnit:mapping.sellingUnit || 'PACK', packsPerPoCase, packsPerPhysicalCarton,
        sellingQuantity, physicalCartons, poDisplayUnitPrice, poLineAmount, effectivePackPrice,
        sellingPrice:poDisplayUnitPrice, priceSource:'PURCHASE_ORDER',
        vatTreatment:line.vatTreatment || po.vatTreatment || 'VAT_INCLUSIVE',
        calculatedAmount:poLineAmount
      };
    });
    const poTolerance = normalize(customerCode) === 'SM' ? 0.25 : 0.01;
    return {...po,customerCode,lines,totals:calculateTotals(lines,po.poTotal,poTolerance)};
  }

  function validateForGeneration(transaction) {
    const errors = [];
    if (!String(transaction.customerCode || '').trim()) errors.push({code:'MISSING_CUSTOMER',message:'Please choose the customer.'});
    if (!String(transaction.poNumber || '').trim()) errors.push({code:'MISSING_PO_NUMBER',message:'PO number is required.'});
    if (!Array.isArray(transaction.lines) || !transaction.lines.length) errors.push({code:'MISSING_ITEMS',message:'At least one item is required.'});
    (transaction.lines || []).forEach((line,index) => {
      if (!line.matched) errors.push({code:'UNMATCHED_PRODUCT',line:index,message:'Product could not be matched.'});
      if (!(Number(line.poQuantity) > 0)) errors.push({code:'INVALID_QUANTITY',line:index,message:'Quantity conversion needs review.'});
      if (line.matched && !(Number(line.packsPerPhysicalCarton) > 0)) errors.push({code:'MISSING_CONVERSION',line:index,message:'Quantity conversion needs review.'});
      if (line.matched && !(Number(line.poLineAmount || line.lineAmount) > 0)) errors.push({code:'MISSING_PO_LINE_AMOUNT',line:index,message:'Official PO line amount is required. Warehouse prices will not be substituted.'});
    });
    const warnings = [];
    if (transaction.totals && !transaction.totals.poMatches) warnings.push({code:'PO_TOTAL_MISMATCH',message:'PO total does not match the calculated total.'});
    return {canGenerate:errors.length === 0,errors,warnings};
  }

  function findDuplicateUpload(records, candidate) {
    const identity = (records || []).find(record => normalize(record.customerCode) === normalize(candidate.customerCode) && normalize(record.poNumber) === normalize(candidate.poNumber));
    if (identity) return {record:identity,reason:'PO_NUMBER'};
    const hash = String(candidate.fileHash || '').toLowerCase();
    const sameHash = hash && (records || []).find(record => String(record.fileHash || '').toLowerCase() === hash);
    return sameHash ? {record:sameHash,reason:'FILE_HASH'} : null;
  }

  const mmToPoints = mm => Number(mm) * 72 / 25.4;
  function applyCalibration(point, calibration = {}) {
    const scale = (Number(calibration.scalePercent) || 100) / 100;
    return {x:Number(point.x) * scale + mmToPoints(calibration.xOffsetMm || 0),y:Number(point.y) * scale + mmToPoints(calibration.yOffsetMm || 0)};
  }

  function nextDocumentVersion(documents, type, variant) {
    return (documents || []).filter(document => document.type === type && document.variant === variant).reduce((max,document) => Math.max(max,Number(document.version) || 0),0) + 1;
  }

  return {UnsupportedProfileError,detectCustomerProfile,parsePurchaseOrder,validateExtractedPo,matchMapping,applyMappingsAndCalculate,calculateTotals,validateForGeneration,findDuplicateUpload,mmToPoints,applyCalibration,nextDocumentVersion,normalize,money};
}));
