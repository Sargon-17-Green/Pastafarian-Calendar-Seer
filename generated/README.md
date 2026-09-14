# Generated Seer cache

`index.json` and `calc/*.json` are generated and committed by `precompute/generate-cache.mjs`.
They are intentionally absent from the source delta until the first successful bootstrap run, because their
contents must be produced by the native Seer batch backend and validated before publication.
