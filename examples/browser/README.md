# Browser integration example

This is a no-build static example for the browser-safe Seer HTTP client. It imports the repository copy of `client/index.mjs`; it does not duplicate calendar or transport logic.

First start a Seer HTTP server from an installed/built package:

```text
npm run build:native
npm start
```

The server defaults to `http://127.0.0.1:8080`.

Then serve the repository root with any static HTTP server. For example, from the repository root:

```text
python -m http.server 8000
```

Open `http://127.0.0.1:8000/examples/browser/`. The page defaults to the local Seer API but accepts another HTTP base URL. Cross-origin use is supported by the Seer HTTP service's public CORS policy.

The example intentionally uses canonical presentation so it does not depend on the currently English-only presentation layer.
