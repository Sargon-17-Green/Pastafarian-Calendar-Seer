# Localization and locale packs

Localization in Pastafarian Calendar Seer is presentation-only. Locale data must never influence year numbers, cutlet or month indices, gate selection, Sauce, calculation-day boundaries, reverse conversion, exact-runtime behavior, JDNs, or canonical JSON coordinates.

## Runtime architecture

Runtime packs live in `query/locales/`. `catalog.mjs` imports them statically, validates every pack when the module is loaded, and keeps the immutable catalog in memory. Queries never derive a file path from user input and never perform a locale disk read per request.

Every pack has schema version `1` and contains:

- canonical BCP 47 `code`;
- English `name` and native `selfName`;
- `direction` (`ltr` or `rtl`);
- pack `version`;
- `properNamePolicy`;
- exactly 17 cutlet display names in canonical-index order;
- exactly 47 month display names in canonical-index order;
- a date-formatting function.

`api/schemas/locale-pack.schema.json` describes the pack shape. The JavaScript `validateLocalePack()` check additionally enforces that the runtime formatter is callable and that the locale code is already in canonical BCP 47 casing.

## Locale negotiation and fallback

The default locale is `en`. Full presentation validates the structural BCP 47 tag with `Intl.getCanonicalLocales` and applies an explicit, deterministic casing normalization; for example `EN` becomes `en`, `zh-hans-cn` becomes `zh-Hans-CN`. Deprecated language aliases are not silently remapped into a supported locale.

A syntactically valid but unsupported code such as `en-US` fails with `LOCALE_NOT_SUPPORTED`. A malformed code such as `en_us` fails with `INVALID_LOCALE`. There is no language-subtag fallback and no silent per-string English fallback.

`presentation: "canonical"` is language-free and intentionally ignores `locale`, including malformed or unsupported locale values. This preserves the v1 machine-oriented contract.

HTTP v1 uses explicit `locale` parameters only. `Accept-Language` is not negotiated. The browser client carries locale values to the HTTP API and contains no translation catalog.

## English and Hebrew

English is a normal locale pack and therefore exercises the same catalog, validator, name lookup, and formatter path as every other locale.

The first additional pack is `he`. It localizes formatting, self-name, and RTL direction. Its 17+47 Pastafarian proper names are deliberately the verified English names and the pack declares `properNamePolicy: "english-retained"`. This is explicit pack data, not a missing-string fallback.

Those proper names must not be translated until an authoritative naming source is supplied and documented.

Hebrew formatted text uses Unicode bidi isolation around inserted exact integers and retained LTR proper names. Machine-readable numeric fields remain ASCII decimal strings.

## API discovery

`GET /v1/locales` is the client discovery source. Each entry includes:

- `tag` — retained for v1 backward compatibility;
- `code` — canonical BCP 47 code;
- `name` and `selfName`;
- `direction`;
- `default`;
- locale-pack schema and data versions;
- `properNamePolicy`.

Node consumers may use `listLocales()` and `DEFAULT_LOCALE` from the package root. The HTTP browser client exposes `getLocales()`.

## Adding a locale

A localization contribution must not touch the mathematical engine or canonical indices. Add a complete pack, register it statically in `catalog.mjs`, and document the translation authority or the decision to retain verified proper names.

Before merging a locale contribution:

1. provide all 17 cutlet and 47 month entries in canonical order;
2. run locale-pack validation;
3. run semantic-invariance differential tests;
4. run date, reverse, year, HTTP, browser-client, CLI, and package self-tests;
5. verify `/v1/locales` metadata;
6. verify the npm package contains all runtime locale modules and no authoring notes or `HANDOFF_*` material.

Partial packs are rejected. Do not sort localized names alphabetically, infer canonical identity from a translated string, or accept localized names as reverse-conversion input.

Reverse conversion continues to accept canonical indices only.

## Semantic invariance

For identical calculation, target, and include inputs, locale changes may alter only presentation fields: `locale`, localized `name` properties, and formatted text.

Calculation-day data, target JDN/Gregorian data, canonical indices, days, structure, boundaries, provenance, resolution, and reverse coordinates must be unchanged.

The localization tests strip presentation-only fields and compare full `en` and `he` results directly with canonical results. They also exercise canonical cutlet index 17 and month index 47 to catch off-by-one errors.

Broad formatter/catalog tests use deterministic fixture records so localization does not multiply expensive exact-engine calculations. Repository and deployment suites remain responsible for the exact runtime itself, including rolling-cache, cache-miss, negative-gate, Foundation-adjacent, reverse, and year paths.

## RTL and web rendering

`direction` is presentation metadata only. A web UI should set its text direction from locale metadata and insert returned `formatted` text as text content, never via `innerHTML`.

Mixed-direction content should preserve bidi isolation. Exact JDNs, canonical indices, IDs, and other machine fields are not transformed for RTL locales.

## Security

Locale packs are trusted repository data. Locale input is never concatenated into a file path. The runtime uses a statically imported catalog and validates the requested code before lookup, so values such as `../../...` cannot become filesystem access.

## Versioning

Locale-pack `version` tracks presentation-data changes and is independent of the npm package version. Public API/package versioning is decided at release time after reconciling current `main`; locale work must not create a competing release tag.

## Contribution checklist

- Do not edit the calendar engine, gates, Sauce, Foundation JDN, or cache semantics.
- Do not change canonical indices or order.
- Supply exactly 17 cutlet and 47 month display entries.
- State the source or policy for translated proper names.
- Run locale validation and semantic-invariance tests.
- Run the package self-test and verify installed non-English presentation.
- Keep `HANDOFF_*`, translation working notes, and other authoring-only material out of git/package/release assets.
