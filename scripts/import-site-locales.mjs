#!/usr/bin/env node
// Regenerate Seer response-locale snapshots from a pinned checkout of
// Sargon17-Green/pastafari-calendar. This script performs no network access.
//
// Usage:
//   node scripts/import-site-locales.mjs \
//     --source-root ../pastafari-calendar \
//     --source-revision <exact-40-char-sha> \
//     --output-dir query/locales
//
// The seven generated site-imported-01..07.mjs files deliberately contain
// only presentation resources used by Seer: locale metadata, three date-line
// templates, and the 17+47 display names.

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const sourceRoot = args.get('--source-root');
const sourceRevision = args.get('--source-revision');
const outputDir = args.get('--output-dir') ?? 'query/locales';
if (!sourceRoot || !/^[0-9a-f]{40}$/.test(sourceRevision ?? '')) {
  throw new Error('--source-root and exact 40-character --source-revision are required.');
}

const importFile = async (file) => import(pathToFileURL(path.resolve(file)).href);
const registry = await importFile(path.join(sourceRoot, 'docs/i18n/registry.js'));
const identifiers = await importFile(path.join(sourceRoot, 'docs/i18n/calendar-identifiers.js'));
const english = (await importFile(path.join(sourceRoot, 'docs/i18n/locales/en.js'))).default;

const partial = registry.LOCALES.filter(({ support }) => support === 'partial');
if (partial.length !== 70) throw new Error(`Expected 70 upstream partial locales; received ${partial.length}.`);
if (identifiers.CUTLETS.length !== 17 || identifiers.MONTHS.length !== 47) {
  throw new Error('Upstream canonical identifier counts changed.');
}

const englishNames = new Intl.DisplayNames(['en'], { type: 'language' });
const data = [];
for (const metadata of partial) {
  const source = (await importFile(path.join(sourceRoot, `docs/i18n/locales/${metadata.code}.js`))).default;
  registry.validateLocaleSourceContract(source, metadata, english);

  const cutlets = identifiers.CUTLETS.map(({ id }) => source.calendar?.cutlets?.[id]);
  const months = identifiers.MONTHS.map(({ id }) => source.calendar?.months?.[id]);
  if (cutlets.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error(`Locale ${metadata.code} has an incomplete cutlet catalog.`);
  }
  if (months.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error(`Locale ${metadata.code} has an incomplete month catalog.`);
  }
  if (new Set(cutlets).size !== cutlets.length || new Set(months).size !== months.length) {
    throw new Error(`Locale ${metadata.code} contains duplicate display names; manual adjudication required.`);
  }

  const templates = {
    year: source.messages?.['date.yearLine'],
    cutlet: source.messages?.['date.cutletLine'],
    month: source.messages?.['date.monthLine'],
  };
  if (Object.values(templates).some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error(`Locale ${metadata.code} is missing a required date-line template.`);
  }

  data.push({
    code: metadata.code,
    name: englishNames.of(metadata.code) ?? metadata.code,
    selfName: metadata.displayName,
    direction: metadata.dir,
    sourceSupport: metadata.support,
    templates,
    cutlets,
    months,
  });
}

await fs.mkdir(path.resolve(outputDir), { recursive: true });
const chunkSize = 10;
for (let offset = 0; offset < data.length; offset += chunkSize) {
  const chunk = data.slice(offset, offset + chunkSize);
  const ordinal = String(offset / chunkSize + 1).padStart(2, '0');
  const output = path.resolve(outputDir, `site-imported-${ordinal}.mjs`);
  const source = [
    `// GENERATED SNAPSHOT. Source: Sargon17-Green/pastafari-calendar@${sourceRevision}`,
    "import { createImportedLocalePack } from './site-imported-factory.mjs';",
    '',
    `const SPECS = ${JSON.stringify(chunk, null, 2)};`,
    '',
    'export const LOCALE_PACKS = Object.freeze(SPECS.map(createImportedLocalePack));',
    '',
  ].join('\n');
  await fs.writeFile(output, source, 'utf8');
  console.log(`Wrote ${chunk.length} locales to ${output}`);
}

console.log(`Regenerated ${data.length} pinned response locales from ${sourceRevision}.`);
