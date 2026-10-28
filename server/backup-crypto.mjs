// AES-256-GCM encrypt/decrypt stdin -> stdout with BACKUP_PASSPHRASE.
// File layout: "FXB1" | salt(16) | iv(12) | ciphertext | tag(16)
//   node server/backup-crypto.mjs encrypt < in > out
//   node server/backup-crypto.mjs decrypt < in > out
import crypto from 'node:crypto';

const pass = process.env.BACKUP_PASSPHRASE;
if (!pass) { console.error('BACKUP_PASSPHRASE is not set'); process.exit(1); }
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const input = Buffer.concat(chunks);
const key = (salt) => crypto.scryptSync(pass, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

if (process.argv[2] === 'encrypt') {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(salt), iv);
  const body = Buffer.concat([c.update(input), c.final()]);
  process.stdout.write(Buffer.concat([Buffer.from('FXB1'), salt, iv, body, c.getAuthTag()]));
} else if (process.argv[2] === 'decrypt') {
  if (input.subarray(0, 4).toString() !== 'FXB1') { console.error('Not a forx-radio-club backup'); process.exit(1); }
  const salt = input.subarray(4, 20), iv = input.subarray(20, 32), tag = input.subarray(-16);
  const d = crypto.createDecipheriv('aes-256-gcm', key(salt), iv);
  d.setAuthTag(tag);
  process.stdout.write(Buffer.concat([d.update(input.subarray(32, -16)), d.final()]));
} else { console.error('usage: encrypt|decrypt'); process.exit(1); }
