'use strict';

const crypto = require('node:crypto');

const SESSION_COOKIE = 'maru_warehouse_session';
const ROLE_LEVEL = Object.freeze({viewer:0,operator:1,manager:2,admin:3});
const PASSWORD_ITERATIONS = 210000;

function b64url(value) { return Buffer.from(value).toString('base64url'); }
function secureEqual(a,b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left,right);
}
function hashPassword(password, options = {}) {
  const iterations = Number(options.iterations) || PASSWORD_ITERATIONS;
  const salt = options.salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password),salt,iterations,32,'sha256').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}
function verifyPassword(password, encoded) {
  const [algorithm,iterationsRaw,salt,expected] = String(encoded || '').split('$');
  if (algorithm !== 'pbkdf2' || !iterationsRaw || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password),salt,Number(iterationsRaw),32,'sha256').toString('hex');
  return secureEqual(actual,expected);
}
function createSessionToken(user,secret,options = {}) {
  if (!secret || String(secret).length < 32) throw new Error('WAREHOUSE_PORTAL_SESSION_SECRET must be at least 32 characters.');
  const now = Number(options.now == null ? Math.floor(Date.now()/1000) : options.now);
  const payload = b64url(JSON.stringify({sub:user.username,name:user.displayName || user.username,role:user.role,iat:now,exp:now+(Number(options.ttlSeconds)||43200)}));
  const signature = crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifySessionToken(token,secret,options = {}) {
  try {
    const [payload,signature] = String(token || '').split('.');
    if (!payload || !signature || !secret) return null;
    const expected = crypto.createHmac('sha256',secret).update(payload).digest('base64url');
    if (!secureEqual(signature,expected)) return null;
    const value = JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    const now = Number(options.now == null ? Math.floor(Date.now()/1000) : options.now);
    if (!value.sub || !ROLE_LEVEL.hasOwnProperty(value.role) || value.exp < now) return null;
    return {username:value.sub,displayName:value.name,role:value.role,issuedAt:value.iat,expiresAt:value.exp};
  } catch (_) { return null; }
}
function parseCookies(header) {
  return Object.fromEntries(String(header || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return index < 0 ? [part,''] : [part.slice(0,index),decodeURIComponent(part.slice(index+1))];
  }));
}
function getRequestUser(req) {
  const token = parseCookies(req && req.headers && req.headers.cookie)[SESSION_COOKIE];
  return verifySessionToken(token,process.env.WAREHOUSE_PORTAL_SESSION_SECRET || '');
}
function requireRole(user,minimumRole) {
  return !!user && ROLE_LEVEL[user.role] >= ROLE_LEVEL[minimumRole];
}
function getConfiguredUsers() {
  let users;
  try { users = JSON.parse(process.env.WAREHOUSE_PORTAL_USERS_JSON || '[]'); }
  catch (_) { throw new Error('WAREHOUSE_PORTAL_USERS_JSON is not valid JSON.'); }
  if (!Array.isArray(users)) throw new Error('WAREHOUSE_PORTAL_USERS_JSON must be an array.');
  return users.filter(user => user && user.username && user.passwordHash && ROLE_LEVEL.hasOwnProperty(user.role));
}
function sessionCookie(token,maxAge = 43200) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
function sanitizeFilename(filename) {
  const basename = String(filename || 'document.pdf').replace(/\\/g,'/').split('/').pop() || 'document.pdf';
  const cleaned = basename.replace(/\s+/g,'_').replace(/[^A-Za-z0-9._-]/g,'_').replace(/\.{2,}/g,'.').slice(0,120);
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}
function validatePdfBuffer(buffer,mimeType,maxBytes = 3*1024*1024) {
  if (mimeType !== 'application/pdf') return {valid:false,error:'Please upload a PDF file.'};
  if (!Buffer.isBuffer(buffer) || !buffer.length) return {valid:false,error:'The PDF file is empty.'};
  if (buffer.length > maxBytes) return {valid:false,error:`The PDF is too large. Maximum size is ${Math.floor(maxBytes/1024/1024)} MB.`};
  if (buffer.subarray(0,5).toString('ascii') !== '%PDF-') return {valid:false,error:'The uploaded file is not a valid PDF.'};
  return {valid:true};
}
function requireAuthenticated(req,res,minimumRole = 'viewer') {
  const user = getRequestUser(req);
  if (!requireRole(user,minimumRole)) {
    res.statusCode = user ? 403 : 401;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({success:false,error:user ? 'You do not have permission for this action.' : 'Please sign in to continue.'}));
    return null;
  }
  return user;
}

module.exports = {SESSION_COOKIE,ROLE_LEVEL,hashPassword,verifyPassword,createSessionToken,verifySessionToken,parseCookies,getRequestUser,requireRole,getConfiguredUsers,sessionCookie,clearSessionCookie,sanitizeFilename,validatePdfBuffer,requireAuthenticated};
