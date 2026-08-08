'use strict';

const crypto = require('node:crypto');

const REF_VERSION = 'v1';
const PO_PATH_PATTERN = /^po\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/(?:original|generated)\/[A-Za-z0-9._-]+\.pdf$/i;

function documentLinkSecret(env = process.env) {
  const dedicated = String(env.WAREHOUSE_PORTAL_DOCUMENT_LINK_SECRET || '');
  if (dedicated.length >= 32) return dedicated;
  const session = String(env.WAREHOUSE_PORTAL_SESSION_SECRET || '');
  if (session.length >= 32) return session;
  throw new Error('WAREHOUSE_PORTAL_DOCUMENT_LINK_SECRET must be at least 32 characters (or use a 32+ character session secret as fallback).');
}

function allowedDocumentPath(pathname) {
  const value = String(pathname || '');
  return value.length <= 512 && PO_PATH_PATTERN.test(value) && !value.includes('..') && !value.includes('//') && !value.includes('\\');
}

function safeDocumentName(filename) {
  const value = String(filename || 'document.pdf').replace(/[\r\n"\\/]/g,'_').slice(0,160);
  return value.toLowerCase().endsWith('.pdf') ? value : `${value}.pdf`;
}

function signDocumentRef(document,options = {}) {
  const pathname = String(document && document.pathname || '');
  if (!allowedDocumentPath(pathname)) throw new Error('Document pathname is not allowed.');
  const payload = Buffer.from(JSON.stringify({p:pathname,n:safeDocumentName(document.filename),d:document.download?'attachment':'inline'})).toString('base64url');
  const signature = crypto.createHmac('sha256',options.secret || documentLinkSecret()).update(`${REF_VERSION}.${payload}`).digest('base64url');
  return `${REF_VERSION}.${payload}.${signature}`;
}

function verifyDocumentRef(ref,options = {}) {
  try {
    const parts = String(ref || '').split('.');
    if (parts.length !== 3 || parts[0] !== REF_VERSION || !parts[1] || !parts[2]) return null;
    const expected = crypto.createHmac('sha256',options.secret || documentLinkSecret()).update(`${parts[0]}.${parts[1]}`).digest();
    const supplied = Buffer.from(parts[2],'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied,expected)) return null;
    const value = JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    if (!value || !allowedDocumentPath(value.p) || !['inline','attachment'].includes(value.d)) return null;
    return {version:REF_VERSION,pathname:value.p,filename:safeDocumentName(value.n),disposition:value.d};
  } catch (_) { return null; }
}

function requestOrigin(req,env = process.env) {
  const configured = String(env.WAREHOUSE_PORTAL_PUBLIC_URL || '').trim().replace(/\/$/,'');
  if (configured) {
    const url = new URL(configured);
    if (!['http:','https:'].includes(url.protocol)) throw new Error('WAREHOUSE_PORTAL_PUBLIC_URL must be HTTP(S).');
    return url.origin;
  }
  const headers = req && req.headers || {};
  const proto = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim().toLowerCase();
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
  if (!['http','https'].includes(proto) || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) throw new Error('Could not determine the public Portal origin.');
  return `${proto}://${host}`;
}

function documentLink(req,document,options = {}) {
  const ref = signDocumentRef(document,options);
  return `${requestOrigin(req,options.env || process.env)}/api/po/file?ref=${encodeURIComponent(ref)}`;
}

module.exports={REF_VERSION,allowedDocumentPath,documentLinkSecret,safeDocumentName,signDocumentRef,verifyDocumentRef,requestOrigin,documentLink};
