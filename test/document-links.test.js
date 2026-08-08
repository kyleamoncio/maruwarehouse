'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {allowedDocumentPath,documentLinkSecret,signDocumentRef,verifyDocumentRef,documentLink}=require('../lib/document-links');
const commitHandler=require('../api/po/commit');

const SECRET='document-link-secret-that-is-definitely-at-least-32-chars';
const document={pathname:'po/WATSONS/9691669-a1b2c3/original/source.pdf',filename:'Customer PO 9691669.pdf'};

test('document refs are versioned, non-expiring, deterministic and timing-safe against tampering',()=>{
  const first=signDocumentRef(document,{secret:SECRET});
  const second=signDocumentRef(document,{secret:SECRET});
  assert.equal(first,second);
  assert.match(first,/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(verifyDocumentRef(first,{secret:SECRET}),{version:'v1',pathname:document.pathname,filename:document.filename,disposition:'inline'});
  const tampered=first.slice(0,-1)+(first.endsWith('A')?'B':'A');
  assert.equal(verifyDocumentRef(tampered,{secret:SECRET}),null);
  assert.equal(verifyDocumentRef(first,{secret:`${SECRET}wrong`}),null);
});

test('document refs enforce the private po path allowlist',()=>{
  assert.equal(allowedDocumentPath(document.pathname),true);
  for(const pathname of ['other/a/b/original/x.pdf','po/a/../original/x.pdf','po/a/b/original/../../x.pdf','po/a/b/original/x.txt','po/a/b/private/x.pdf','po/a/b/original/x%2Fz.pdf']){
    assert.equal(allowedDocumentPath(pathname),false,pathname);
    assert.throws(()=>signDocumentRef({...document,pathname},{secret:SECRET}),/not allowed/);
  }
});

test('dedicated stable document secret is preferred and weak fallback is rejected',()=>{
  assert.equal(documentLinkSecret({WAREHOUSE_PORTAL_DOCUMENT_LINK_SECRET:SECRET,WAREHOUSE_PORTAL_SESSION_SECRET:'x'.repeat(40)}),SECRET);
  assert.equal(documentLinkSecret({WAREHOUSE_PORTAL_DOCUMENT_LINK_SECRET:'short',WAREHOUSE_PORTAL_SESSION_SECRET:'s'.repeat(32)}),'s'.repeat(32));
  assert.throws(()=>documentLinkSecret({WAREHOUSE_PORTAL_SESSION_SECRET:'short'}),/at least 32/);
});

test('absolute signed links use the canonical Portal origin',()=>{
  const link=documentLink({headers:{host:'untrusted.example'}},document,{secret:SECRET,env:{WAREHOUSE_PORTAL_PUBLIC_URL:'https://portal.example/path'}});
  assert.match(link,/^https:\/\/portal\.example\/api\/po\/file\?ref=v1\./);
  assert.ok(verifyDocumentRef(new URL(link).searchParams.get('ref'),{secret:SECRET}));
});

test('commit and SUMMARY client do not depend on legacy PO transaction metadata',()=>{
  const root=path.join(__dirname,'..');
  const commit=fs.readFileSync(path.join(root,'api','po','commit.js'),'utf8');
  const file=fs.readFileSync(path.join(root,'api','po','file.js'),'utf8');
  const client=fs.readFileSync(path.join(root,'public','po-feature.js'),'utf8');
  const sheets=fs.readFileSync(path.join(root,'api','sheets.js'),'utf8');
  assert.match(commit,/upsertSummaryDocuments/);
  assert.match(commit,/\{identity,links\}/);
  assert.match(commit,/putPrivatePdfIdempotent/);
  assert.match(commit,/\['SI','DR'\]/);
  assert.doesNotMatch(commit,/createPoTransaction|recordGeneratedDocuments|getPoTransaction/);
  assert.match(file,/verifyDocumentRef/);
  assert.doesNotMatch(file,/getPoFile|callV2|fileId/);
  assert.match(client,/submitEntry[\s\S]*\/api\/po\/commit/);
  assert.match(client,/getSummaryDocuments/);
  assert.match(sheets,/getSummaryDocuments/);
  assert.doesNotMatch(client,/findSummaryTransaction\(item,state\.transactions\)/);
});

test('document commit identity is deterministic and validation binds reviewed to calculated PO',()=>{
  const reviewed={customerCode:'WATSONS',customerName:'WATSONS PERSONAL CARE',poNumber:'9691669',poDate:'2026-07-26',poTotal:100,lines:[{customerArticleNumber:'1',customerDescription:'PADS',poQuantity:1,poUnit:'CASE',lineAmount:100}]};
  const calculated={...reviewed,lines:[{...reviewed.lines[0],matched:true,internalProductName:'Cotton Pads Fluffy',packsPerPhysicalCarton:1,sellingQuantity:1,physicalCartons:1,effectivePackPrice:100,calculatedAmount:100}],totals:{poMatches:true,poTotal:100,lineTotal:100,poDifference:0}};
  const pdf=Buffer.from('%PDF-1.4\n%%EOF');
  const body={reviewed,calculated};
  assert.doesNotThrow(()=>commitHandler.validateCommit(body,pdf));
  assert.equal(commitHandler.commitIdentity(body,pdf),commitHandler.commitIdentity({calculated:{...calculated},reviewed:{...reviewed}},pdf));
  assert.throws(()=>commitHandler.validateCommit({...body,calculated:{...calculated,poNumber:'DIFFERENT'}},pdf),/numbers do not match/);
});
