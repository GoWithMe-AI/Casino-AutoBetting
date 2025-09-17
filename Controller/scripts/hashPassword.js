const bcrypt = require('bcryptjs');
const pwd = process.argv[2];
if (!pwd) {
  console.log('Usage: node hashPassword.js <password>');
  process.exit(1);
}
const hash = bcrypt.hashSync(pwd, 10);
console.log('bcrypt hash:', hash); 