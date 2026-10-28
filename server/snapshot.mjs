// Writes a consistent copy of the live database to stdout (safe while the app runs).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
const src = path.join(process.env.DATA_DIR || 'data', 'forx.db');
const tmp = path.join(process.env.DATA_DIR || 'data', `.snapshot-${process.pid}.db`);
await new Database(src, { readonly: true }).backup(tmp);
process.stdout.write(fs.readFileSync(tmp));
fs.unlinkSync(tmp);
