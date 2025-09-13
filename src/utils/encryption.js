const crypto = require("crypto");

const ALGO = "aes-256-ctr";
const SECRET = process.env.ENCRYPTION_SECRET || "defaultsecretkeydefaultsecretkey"; // 32 chars

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, Buffer.from(SECRET), iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(hash) {
  const [ivHex, encryptedHex] = hash.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, Buffer.from(SECRET), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString();
}

function hashQuery(query) {
  return crypto.createHash('sha256').update(query || '').digest('hex');
}

module.exports = { encrypt, decrypt, hashQuery };
