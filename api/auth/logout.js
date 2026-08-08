'use strict';
const { clearSessionCookie } = require('../../lib/auth');
module.exports = function handler(req,res) {
  if (req.method !== 'POST') { res.status(405).json({success:false,error:'Method not allowed.'}); return; }
  res.setHeader('Set-Cookie',clearSessionCookie());
  res.status(200).json({success:true});
};
