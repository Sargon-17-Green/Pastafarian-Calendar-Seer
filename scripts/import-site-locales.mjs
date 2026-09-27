#!/usr/bin/env node
// Regenerate Seer response-locale snapshots from a pinned checkout of
// Sargon17-Green/pastafari-calendar. This script performs no network access.
//
// Usage:
//   node scripts/import-site-locales.mjs \
//     --source-root ../pastafari-calendar \
//     --source-revision <exact-40-char-sha> \
//     --output query/locales/site-imported-data.mjs
//
// The generated file deliberately contains only presentation resources used by
// Seer: locale metadata, three date-line templates, and the 17+47 display names.

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1]);
}
const sourceRoot = args.get('--source-root');
const sourceRevision = args.get('--source-revision');
const output = args.get('--output') ?? 'query/locales/site-imported-data.mjs';
if (!sourceRoot || !/^[0-9a-f]{40}$/.test(sourceRevision ?? '')) {
  throw new Error('--source-root and exact 40-character --source-revision are required.');
}

const registryUrl = pathToFileURL(path.resolve(sourceRoot, 'docs/i18n/registry.js')).href;
const identifiersUrl = pathToFileURL(path.resolve(sourceRoot, 'docs/i18n/calendar-identifiers.js')).href;
const registry = await import(registryUrl);
const identifiers = await import(identifiersUrl);

const partial = registry.LOCALES.filter(({ support }) => support === 'partial');
if (partial.length !== 70) {
  throw new Error(`Expected 70 upstream partial locales; received ${partial.length}.`);
}
if (identifiers.CUTLETS.length !== 17 || identifiers.MONTHS.length !== 47) {
  throw new Error('Upstream canonical identifier counts changed.');
}

const englishNames = new Intl.DisplayNames(['en'], { type: 'language' });
const data = [];
for (const metadata of partial) {
  const sourceUrl = pathToFileURL(
    path.resolve(sourceRoot, `docs/i18n/locales/${metadata.code}.js`),
  ).href;
  const source = (await import(sourceUrl)).default;
  registry.validateLocaleSourceContract(
    source,
    metadata,
    (await import(pathToFileURL(path.resolve(sourceRoot, 'docs/i18n/locales/en.js')).href)).default,
  );

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

  for (const key of ['date.yearLine', 'date.cutletLine', 'date.monthLine']) {
    if (typeof source.messages?.[key] !== 'string' || !source.messages[key].trim()) {
      throw new Error(`Locale ${metadata.code} is missing ${key}.`);
    }
  }

  data.push({
    code: metadata.code,
    name: englishNames.of(metadata.code) ?? metadata.code,
    selfName: metadata.displayName,
    direction: metadata.dir,
    sourceSupport: metadata.support,
    templates: {
      year: source.messages['date.yearLine'],
      cutlet: source.messages['date.cutletLine'],
      month: source.messages['date.monthLine'],
    },
    cutlets,
    months,
  });
}

const header = [
  '// GENERATED FILE — DO NOT EDIT BY HAND.',
  '// Source: Sargon17-Green/pastafari-calendar',
  `// Source revision: ${sourceRevision}`,
  '// Generator: scripts/import-site-locales.mjs',
  '',
  `export const SOURCE_REVISION = '${sourceRevision}';`,
  `export const IMPORTED_LOCALE_SPECS = Object.freeze(${JSON.stringify(data, null, 2)});`,
  '',
].join('\n');
await fs.writeFile(path.resolve(output), header, 'utf8');
console.log(`Wrote ${data.length} locale snapshots to ${output}`);
