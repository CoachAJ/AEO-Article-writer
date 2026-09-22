# Project verification

- Run `npm test` for retry and endpoint regression tests. These use Node's built-in test runner, the real Google SDK, and mocked HTTP responses; no API credentials or live Gemini requests are needed.
- Run `node --check server.js`, `node --check netlify/functions/generate.js`, `node --check netlify/functions/regenerate-image.js`, and `git diff --check` for syntax and whitespace checks.
- `server.js` provides the local Express endpoints. Netlify uses separate handlers in `netlify/functions/`; keep equivalent behavior in both deployments.
- `gemini-retry.js` is shared by both deployments and lives outside the Netlify functions directory so it is not deployed as a standalone endpoint.
- Create one Gemini generator per incoming request so text generation and optional image generation share the same execution deadline.
