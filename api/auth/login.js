'use strict';
const { getConfiguredUsers, verifyPassword, createSessionToken, sessionCookie } = require('../../lib/auth');

module.exports = function handler(req,res) {
  if (req.method !== 'POST') { res.status(405).json({success:false,error:'Method not allowed.'}); return; }
  const {username,password} = req.body || {};
  const user = getConfiguredUsers().find(candidate => String(candidate.username).toLowerCase() === String(username || '').trim().toLowerCase());
  if (!user || !verifyPassword(password,user.passwordHash)) { res.status(401).json({success:false,error:'Username or password is incorrect.'}); return; }
  const token = createSessionToken(user,process.env.WAREHOUSE_PORTAL_SESSION_SECRET || '');
  res.setHeader('Set-Cookie',sessionCookie(token));
  res.status(200).json({success:true,user:{username:user.username,displayName:user.displayName || user.username,role:user.role}});
};
