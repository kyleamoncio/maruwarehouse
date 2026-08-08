'use strict';
const { getRequestUser } = require('../../lib/auth');
module.exports = function handler(req,res) {
  if (req.method !== 'GET') { res.status(405).json({success:false,error:'Method not allowed.'}); return; }
  const user = getRequestUser(req);
  if (!user) { res.status(401).json({success:false,error:'Not signed in.'}); return; }
  res.status(200).json({success:true,user});
};
