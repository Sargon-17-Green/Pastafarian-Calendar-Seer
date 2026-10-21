# Stage 5 — exact fallback and complete year provider

This stage removes the rolling-cache horizon from public query semantics.

The existing provider remains cache-first. A normal cache miss now falls through to the existing canonical `seer_year_batch` engine instead of becoming `SEER_UNAVAILABLE`. A small native `seer_year_locator` reuses the existing canonical year-selection implementation to locate requested year boundaries; the existing batch engine then supplies the complete exact day sequence from which the provider derives the public year structure.

This ZIP is a **direct-upload delta**: its paths are repository-relative. Upload these files into the matching paths in the repository. There is no `payload/` wrapper and no package-level `SHA256SUMS.txt` to overwrite repository files.
