import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const src = 'node_modules/stockfish/bin';
const alt = 'node_modules/stockfish/src';
const dir = existsSync(src) ? src : alt;
if (!existsSync(dir)) { console.warn('Stockfish package missing; run npm install.'); process.exit(0); }
const files = readdirSync(dir).filter(f => /stockfish-19-lite-single\.(js|wasm)$/.test(f));
mkdirSync('public/engine', { recursive:true });
for (const file of files) cpSync(join(dir,file),join('public/engine',file));
if(files.length !== 2) console.warn('Expected Stockfish 19 lite-single JS and WASM; files:',files);
else console.log('Stockfish lite engine copied to public/engine');
