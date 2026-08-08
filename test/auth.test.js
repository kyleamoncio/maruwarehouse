'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { hashPassword, verifyPassword, createSessionToken, verifySessionToken, requireRole, sanitizeFilename, validatePdfBuffer } = require('../lib/auth');

test('password hashes use salted PBKDF2 and verify without storing plaintext', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.match(hash,/^pbkdf2\$\d+\$/);
  assert.equal(hash.includes('correct horse'),false);
  assert.equal(verifyPassword('correct horse battery staple',hash),true);
  assert.equal(verifyPassword('wrong',hash),false);
});

test('signed sessions reject tampering and preserve role/expiry', () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const token = createSessionToken({username:'mom',displayName:'Warehouse',role:'operator'},secret,{now:1000,ttlSeconds:60});
  assert.equal(verifySessionToken(token,secret,{now:1020}).role,'operator');
  assert.equal(verifySessionToken(token.slice(0,-1)+'x',secret,{now:1020}),null);
  assert.equal(verifySessionToken(token,secret,{now:1061}),null);
});

test('authorization role order protects create, regenerate, and replace operations', () => {
  assert.equal(requireRole({role:'operator'},'operator'),true);
  assert.equal(requireRole({role:'operator'},'manager'),false);
  assert.equal(requireRole({role:'manager'},'operator'),true);
  assert.equal(requireRole({role:'admin'},'manager'),true);
});

test('filenames are sanitized and uploaded data must be a real PDF', () => {
  assert.equal(sanitizeFilename('../../Watsons PO 9691669?.pdf'),'Watsons_PO_9691669_.pdf');
  const valid = Buffer.from('%PDF-1.7\nfixture');
  assert.deepEqual(validatePdfBuffer(valid,'application/pdf',1024),{valid:true});
  assert.equal(validatePdfBuffer(Buffer.from('not pdf'),'application/pdf',1024).valid,false);
  assert.equal(validatePdfBuffer(valid,'image/png',1024).valid,false);
  assert.equal(validatePdfBuffer(Buffer.alloc(1025,1),'application/pdf',1024).valid,false);
});
