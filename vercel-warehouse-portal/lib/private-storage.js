'use strict';
const crypto = require('node:crypto');
const { put, get, del } = require('@vercel/blob');

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
async function putPrivatePdf(pathname,buffer) {
  return put(pathname,buffer,{access:'private',contentType:'application/pdf',addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:60});
}
async function putPrivatePdfIdempotent(pathname,buffer) {
  return put(pathname,buffer,{access:'private',contentType:'application/pdf',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60});
}
async function getPrivatePdf(pathname) { return get(pathname,{access:'private',useCache:false}); }
async function deletePrivateFile(pathname) { if (pathname) await del(pathname); }
module.exports = {sha256,putPrivatePdf,putPrivatePdfIdempotent,getPrivatePdf,deletePrivateFile};
