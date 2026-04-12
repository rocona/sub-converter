# Surge Subscription Converter

Small Node.js service that converts universal subscriptions into Surge `[Proxy]` lines and serves a browser UI.

- Supports `vmess://`, `ss://`, `trojan://`, `hy2://`, and `hysteria2://`
- Generates a new replacement URL that can wrap an original subscription URL
- Can force Trojan nodes to append missing WebSocket parameters

## Local Run

```bash
npm run dev
```

Then open `http://127.0.0.1:3000`.

In cloud environments, the service follows `PORT` and falls back to `3001`.
