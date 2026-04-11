import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || process.env.ZEABUR_PORT || 8080);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

function encodeSurgeValue(value) {
  return String(value).replace(/,/g, "\\,");
}

function parseMaybeBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function ensureLeadingSlash(value) {
  if (!value) {
    return "/";
  }

  return value.startsWith("/") ? value : `/${value}`;
}

function makeUniqueName(baseName, usedNames) {
  let name = baseName || "Unnamed";
  let cursor = 2;

  while (usedNames.has(name)) {
    name = `${baseName || "Unnamed"} ${cursor}`;
    cursor += 1;
  }

  usedNames.add(name);
  return name;
}

function looksLikeMetaNode(name) {
  const normalized = String(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:()\[\]{}<>\-_=+|\\/.,，。!！?？'"`~]+/g, "");

  const metaPatterns = [
    /剩余流量/,
    /套餐到期/,
    /流量重置/,
    /距离下次重置/,
    /距离下次重置剩余/,
    /过滤掉\d+条线路/,
    /请每月更新一次订阅/,
    /官网/,
    /客户端/,
    /流量查询/,
    /订阅说明/
  ];

  return metaPatterns.some((pattern) => pattern.test(normalized));
}

function detectSubscriptionBody(rawText) {
  const text = rawText.trim();

  if (!text) {
    return "";
  }

  if (text.includes("://") || text.includes("[Proxy]")) {
    return text;
  }

  try {
    const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8");
    if (decoded.includes("://") || decoded.includes("[Proxy]")) {
      return decoded;
    }
  } catch {
    return text;
  }

  return text;
}

function parseSsurgeLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseVmessUri(line, options) {
  const payload = line.slice("vmess://".length).trim();
  const json = JSON.parse(decodeBase64Url(payload));
  const name = json.ps || `${json.add}:${json.port}`;
  const host = json.add;
  const port = Number(json.port);
  const params = [`username=${json.id}`];

  if (json.aid && json.aid !== "0") {
    params.push(`alterId=${encodeSurgeValue(json.aid)}`);
  }

  const tlsEnabled = ["tls", "reality"].includes(String(json.tls || "").toLowerCase());
  if (tlsEnabled) {
    params.push("tls=true");
  }

  if (json.sni) {
    params.push(`sni=${encodeSurgeValue(json.sni)}`);
  } else if (json.host && tlsEnabled) {
    params.push(`sni=${encodeSurgeValue(json.host)}`);
  }

  if (json.net === "ws") {
    params.push("ws=true");
    params.push(`ws-path=${encodeSurgeValue(ensureLeadingSlash(json.path || "/"))}`);
    if (json.host) {
      params.push(`ws-headers=Host: ${encodeSurgeValue(json.host)}`);
    }
  }

  if (json.scy && json.scy !== "auto" && json.scy !== "none") {
    params.push(`encrypt-method=${encodeSurgeValue(json.scy)}`);
  }

  const skipCertVerify = parseMaybeBoolean(json.allowInsecure);
  if (skipCertVerify !== null) {
    params.push(`skip-cert-verify=${skipCertVerify}`);
  }

  if (options.enableUdpRelay) {
    params.push("udp-relay=true");
  }

  return {
    type: "vmess",
    name,
    line: `${name} = vmess, ${host}, ${port}, ${params.join(", ")}`
  };
}

function parseShadowsocksUri(line, options) {
  const withoutScheme = line.slice("ss://".length);
  const [mainPart, tagPart = ""] = withoutScheme.split("#");
  const decodedName = decodeURIComponent(tagPart || "");
  const [serverPart, queryPart = ""] = mainPart.split("?");
  const query = new URLSearchParams(queryPart);
  const plugin = query.get("plugin");

  let credentials = "";
  let host = "";
  let port = "";

  if (serverPart.includes("@")) {
    const [credentialPart, addressPart] = serverPart.split("@");
    credentials = credentialPart.includes(":") ? credentialPart : decodeBase64Url(credentialPart);
    [host, port] = addressPart.split(":");
  } else {
    const decoded = decodeBase64Url(serverPart);
    const match = decoded.match(/^(.+?):(.+?)@(.+?):(\d+)$/);
    if (!match) {
      throw new Error("Unsupported ss URI layout");
    }
    credentials = `${match[1]}:${match[2]}`;
    host = match[3];
    port = match[4];
  }

  const credentialParts = credentials.split(":");
  const encryptMethod = credentialParts.shift();
  const password = credentialParts.join(":");
  const name = decodedName || `${host}:${port}`;
  const params = [
    `encrypt-method=${encodeSurgeValue(encryptMethod)}`,
    `password=${encodeSurgeValue(password)}`
  ];

  if (plugin && /obfs-local/.test(plugin)) {
    const pluginParams = new URLSearchParams(plugin.split(";").slice(1).join("&"));
    const mode = pluginParams.get("obfs") || "http";
    params.push(`obfs=${encodeSurgeValue(mode)}`);
    if (pluginParams.get("obfs-host")) {
      params.push(`obfs-host=${encodeSurgeValue(pluginParams.get("obfs-host"))}`);
    }
    if (pluginParams.get("obfs-uri")) {
      params.push(`obfs-uri=${encodeSurgeValue(pluginParams.get("obfs-uri"))}`);
    }
  }

  if (options.enableUdpRelay) {
    params.push("udp-relay=true");
  }

  return {
    type: "ss",
    name,
    line: `${name} = ss, ${host}, ${port}, ${params.join(", ")}`
  };
}

function resolveTrojanWsHost(queryValues, options, fallbackHost) {
  const mode = options.trojanWsHostMode || "peer";

  if (mode === "custom" && options.trojanWsHost) {
    return options.trojanWsHost;
  }

  if (mode === "sni") {
    return options.trojanSniOverride || queryValues.sni || queryValues.peer || fallbackHost;
  }

  return queryValues.peer || queryValues.sni || options.trojanWsHost || fallbackHost;
}

function parseTrojanUri(line, options) {
  const url = new URL(line);
  const name = decodeURIComponent(url.hash.replace(/^#/, "")) || `${url.hostname}:${url.port}`;
  const queryValues = Object.fromEntries(url.searchParams.entries());
  const host = url.hostname;
  const port = Number(url.port);
  const password = decodeURIComponent(url.username || "");
  const sni = options.trojanSniOverride || queryValues.sni || queryValues.peer || host;
  const params = [
    `password=${encodeSurgeValue(password)}`,
    `sni=${encodeSurgeValue(sni)}`,
    `skip-cert-verify=${parseMaybeBoolean(queryValues.allowInsecure) === true}`
  ];

  const shouldEnableWs =
    options.forceTrojanWs ||
    ["ws", "websocket"].includes(String(queryValues.type || queryValues.network || "").toLowerCase());

  if (shouldEnableWs) {
    const wsPath = ensureLeadingSlash(queryValues.path || options.trojanWsPath || "/images");
    const wsHost = resolveTrojanWsHost(queryValues, options, host);
    params.push("ws=true");
    params.push(`ws-path=${encodeSurgeValue(wsPath)}`);
    params.push(`ws-headers=Host: ${encodeSurgeValue(wsHost)}`);
  }

  if (options.enableUdpRelay) {
    params.push("udp-relay=true");
  }

  return {
    type: "trojan",
    name,
    line: `${name} = trojan, ${host}, ${port}, ${params.join(", ")}`
  };
}

function convertSubscription(content, options) {
  const body = detectSubscriptionBody(content);
  const lines = parseSsurgeLines(body);
  const warnings = [];
  const converted = [];
  const usedNames = new Set();

  for (const line of lines) {
    try {
      let parsed = null;

      if (line.startsWith("vmess://")) {
        parsed = parseVmessUri(line, options);
      } else if (line.startsWith("ss://")) {
        parsed = parseShadowsocksUri(line, options);
      } else if (line.startsWith("trojan://")) {
        parsed = parseTrojanUri(line, options);
      } else if (line.includes(" = ") && /(vmess|ss|trojan),/.test(line)) {
        parsed = {
          type: "surge",
          name: line.split(" = ")[0].trim(),
          line
        };
      }

      if (!parsed) {
        if (options.keepUnsupported) {
          warnings.push(`Skipped unsupported line: ${line.slice(0, 80)}`);
        }
        continue;
      }

      if (options.skipMetaEntries && looksLikeMetaNode(parsed.name)) {
        continue;
      }

      const uniqueName = makeUniqueName(parsed.name, usedNames);
      const finalLine =
        parsed.type === "surge"
          ? parsed.line.replace(/^([^=]+)/, uniqueName)
          : parsed.line.replace(parsed.name, uniqueName);

      converted.push({
        name: uniqueName,
        type: parsed.type,
        line: finalLine
      });
    } catch (error) {
      warnings.push(`Failed to parse line: ${line.slice(0, 80)} (${error.message})`);
    }
  }

  const header = [
    "# Converted by Surge Subscription Converter",
    `# Total: ${converted.length}`,
    options.subscriptionUrl ? `# Source: ${options.subscriptionUrl}` : null,
    "[Proxy]"
  ]
    .filter(Boolean)
    .join("\n");

  const result = `${header}\n${converted.map((item) => item.line).join("\n")}\n`;

  return {
    result,
    proxies: converted,
    warnings
  };
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function fetchSubscription(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      accept: "*/*"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed with ${response.status}`);
  }

  return response.text();
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

async function serveStatic(req, res) {
  const target = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(publicDir, decodeURIComponent(target));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream; charset=utf-8"
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/api/convert") {
      const body = await parseJsonBody(req);
      const options = {
        subscriptionUrl: body.subscriptionUrl || "",
        forceTrojanWs: Boolean(body.forceTrojanWs),
        trojanWsPath: body.trojanWsPath || "/images",
        trojanWsHost: body.trojanWsHost || "",
        trojanWsHostMode: body.trojanWsHostMode || "peer",
        trojanSniOverride: body.trojanSniOverride || "",
        keepUnsupported: Boolean(body.keepUnsupported),
        skipMetaEntries: body.skipMetaEntries !== false,
        enableUdpRelay: body.enableUdpRelay !== false
      };

      let sourceText = body.rawContent || "";
      if (!sourceText && body.subscriptionUrl) {
        sourceText = await fetchSubscription(body.subscriptionUrl);
      }

      if (!sourceText.trim()) {
        json(res, 400, { error: "Please provide a subscription URL or raw subscription content." });
        return;
      }

      const converted = convertSubscription(sourceText, options);
      json(res, 200, {
        ...converted,
        stats: {
          total: converted.proxies.length,
          vmess: converted.proxies.filter((item) => item.type === "vmess").length,
          ss: converted.proxies.filter((item) => item.type === "ss").length,
          trojan: converted.proxies.filter((item) => item.type === "trojan").length
        }
      });
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    json(res, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(port, () => {
  console.log(`Surge Subscription Converter is listening on http://0.0.0.0:${port}`);
});
