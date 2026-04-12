# Surge Subscription Converter

Small Node.js service that converts universal subscriptions into Surge `[Proxy]` lines and serves a browser UI.

## Local Run

```bash
npm run dev
```

Then open `http://127.0.0.1:3000`.

In cloud environments, the service follows `PORT` and falls back to `3001`.
