# Surge Subscription Converter

Convert universal subscriptions into Surge `[Proxy]` lines with a browser UI and a small Node.js API.

## What It Solves

Some airport subscriptions return generic `vmess://`, `ss://`, and `trojan://` links instead of Surge-ready proxy lines. This project pulls the original subscription, decodes it, and converts it into a Surge `[Proxy]` section that can be copied directly into a configuration file.

It also supports patching broken Trojan WebSocket nodes, which is useful when the upstream subscription forgets to emit:

- `ws=true`
- `ws-path=/images`
- `ws-headers=Host: fast.usfaster.top`

## Features

- Supports `vmess://`, `ss://`, and `trojan://` subscription lines
- Accepts either a remote subscription URL or pasted raw content
- Converts output into a Surge-ready `[Proxy]` section
- Can force Trojan nodes into `ws=true` mode and append `ws-path` and `ws-headers`
- Filters common subscription metadata entries such as remaining traffic and expiry reminders
- Exposes both a browser UI and a `POST /api/convert` API
- Designed for `GitHub -> Zeabur` deployment

## Local Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

In cloud environments, the app follows `PORT` and falls back to `8080`.

## API Example

```bash
curl http://127.0.0.1:3000/api/convert \
  -H 'content-type: application/json' \
  --data '{
    "subscriptionUrl": "https://example.com/api/v1/client/subscribe?token=xxx",
    "forceTrojanWs": true,
    "trojanWsPath": "/images",
    "trojanWsHostMode": "custom",
    "trojanWsHost": "fast.usfaster.top",
    "enableUdpRelay": true
  }'
```

## Request Options

- `subscriptionUrl`: remote subscription address
- `rawContent`: raw subscription content pasted directly into the request
- `forceTrojanWs`: always append Trojan WebSocket parameters
- `trojanWsPath`: WebSocket path to inject when Trojan patching is enabled
- `trojanWsHostMode`: `peer`, `sni`, or `custom`
- `trojanWsHost`: custom WebSocket `Host` header value
- `trojanSniOverride`: override SNI when needed
- `enableUdpRelay`: append `udp-relay=true` for supported protocols
- `skipMetaEntries`: defaults to `true`, filters traffic and expiry pseudo-nodes

## Deploy Notes

- Runtime: Node.js 20+
- Start command: `npm start`
- Recommended deployment flow: push to GitHub first, then deploy from GitHub on Zeabur
