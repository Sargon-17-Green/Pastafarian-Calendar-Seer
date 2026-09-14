#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCacheAnswer } from './cache-lookup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.resolve(here, '..', 'generated');
const targetText = process.argv[2];
if (targetText === undefined) {
  console.error('usage: node precompute/query.mjs <target_jdn> [instant_iso]');
  process.exit(2);
}
const targetJdn = Number(targetText);
if (!Number.isSafeInteger(targetJdn)) {
  console.error('target_jdn must be a safe integer');
  process.exit(2);
}
const instant = process.argv[3] === undefined ? new Date() : new Date(process.argv[3]);
if (!Number.isFinite(instant.getTime())) {
  console.error('instant_iso must be a valid date/time');
  process.exit(2);
}

try {
  const { calcJdn, record } = await loadCacheAnswer({ generatedDir, instant, targetJdn });
  process.stdout.write(`${JSON.stringify({ calcJdn, ...record })}\n`);
} catch (error) {
  console.error(`seer cache query failed: ${error.message}`);
  process.exit(1);
}
