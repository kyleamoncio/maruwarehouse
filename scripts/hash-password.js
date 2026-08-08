'use strict';
const { hashPassword } = require('../lib/auth');
const password = process.argv[2];
if (!password) { console.error('Usage: node scripts/hash-password.js "your password"'); process.exit(1); }
console.log(hashPassword(password));
