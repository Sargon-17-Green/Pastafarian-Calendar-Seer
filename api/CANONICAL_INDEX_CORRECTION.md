# Canonical index correction

Public `canonicalIndex` values are 1-based, matching the frozen `SourceLanguageCatalog v1`:

- cutlets: 1..17;
- months: 1..47.

The current Seer C++ engine/cache stores internal name-table positions as 0-based values. Adapters must convert `internalIndex + 1` at the public query boundary. Internal cache data is not a public API schema.
