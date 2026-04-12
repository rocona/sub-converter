import http from "node:http";
import https from "node:https";
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
  const text = String(value || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  return Buffer.from(text + pad, "base64").toString("utf8");
}

function encodeSurgeValue(value) {
  return String(value == null ? "" : value).replace(/,/g, "\\,");
}

function parseMaybeBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function ensureLeadingSlash(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "/";
  }

  return text.charAt(0) === "/" ? text : `/${text}`;
}

function makeUniqueName(name, usedNames) {
  let base = String(name || "Unnamed").trim() || "Unnamed";
  let candidate = base;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${base} ${index}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function looksLikeMetaNode(name) {
  const text = String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:()\[\]{}<>\-_=+|\\/.,，。!！?？'"`~]+/g, "");

  return [
    "剩余流量",
    "套餐到期",
    "流量重置",
    "距离下次重置",
    "请每月更新一次订阅",
    "流量查询",
    "订阅说明",
    "官网",
    "客户端"
  ].some((keyword) => text.indexOf(keyword) >= 0) || /过滤掉\d+条线路/.test(text);
}

function detectSubscriptionBody(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return "";
  }

  if (text.indexOf("://") >= 0 || text.indexOf("[Proxy]") >= 0) {
    return text;
  }

  try {
    const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8");
    if (decoded.indexOf("://") >= 0 || decoded.indexOf("[Proxy]") >= 0) {
      return decoded;
    }
  } catch {
    return text;
  }

  return text;
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function queryValue(searchParams, key) {
  const value = searchParams.get(key);
  return value == null ? "" : value;
}

function parseVmessUri(line, options) {
  const payload = line.slice(8).trim();
  const json = JSON.parse(decodeBase64Url(payload));
  const name = json.ps || `${json.add}:${json.port}`;
  const host = json.add;
  const proxyPort = Number(json.port);
  const params = [`username=${encodeSurgeValue(json.id)}`];
  const tls = String(json.tls || "").toLowerCase();

  if (json.aid && json.aid !== "0") {
    params.push(`alterId=${encodeSurgeValue(json.aid)}`);
  }

  if (tls === "tls" || tls === "reality") {
    params.push("tls=true");
  }

  if (json.sni) {
    params.push(`sni=${encodeSurgeValue(json.sni)}`);
  } else if (json.host && (tls === "tls" || tls === "reality")) {
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
    line: `${name} = vmess, ${host}, ${proxyPort}, ${params.join(", ")}`
  };
}

function parseShadowsocksUri(line, options) {
  const raw = line.slice(5);
  const hashIndex = raw.indexOf("#");
  const mainPart = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const tagPart = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";
  const decodedName = decodeURIComponent(tagPart || "");

  const queryIndex = mainPart.indexOf("?");
  const serverPart = queryIndex >= 0 ? mainPart.slice(0, queryIndex) : mainPart;
  const queryPart = queryIndex >= 0 ? mainPart.slice(queryIndex + 1) : "";
  const query = new URLSearchParams(queryPart);
  const plugin = query.get("plugin") || "";

  let credentials = "";
  let host = "";
  let proxyPort = "";

  if (serverPart.indexOf("@") >= 0) {
    const pair = serverPart.split("@");
    const credentialPart = pair[0];
    const addressPart = pair[1] || "";
    credentials = credentialPart.indexOf(":") >= 0 ? credentialPart : decodeBase64Url(credentialPart);
    const address = addressPart.split(":");
    host = address[0] || "";
    proxyPort = address[1] || "";
  } else {
    const decoded = decodeBase64Url(serverPart);
    const match = decoded.match(/^(.+?):(.+?)@(.+?):(\d+)$/);
    if (!match) {
      throw new Error("Unsupported ss URI layout");
    }
    credentials = `${match[1]}:${match[2]}`;
    host = match[3];
    proxyPort = match[4];
  }

  const credentialParts = credentials.split(":");
  const encryptMethod = credentialParts.shift() || "";
  const password = credentialParts.join(":");
  const name = decodedName || `${host}:${proxyPort}`;
  const params = [
    `encrypt-method=${encodeSurgeValue(encryptMethod)}`,
    `password=${encodeSurgeValue(password)}`
  ];

  if (plugin.indexOf("obfs-local") >= 0) {
    const pluginBits = plugin.split(";");
    const pluginParams = new URLSearchParams(pluginBits.slice(1).join("&"));
    params.push(`obfs=${encodeSurgeValue(pluginParams.get("obfs") || "http")}`);
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
    line: `${name} = ss, ${host}, ${proxyPort}, ${params.join(", ")}`
  };
}

function resolveTrojanWsHost(searchParams, options, fallbackHost) {
  const mode = options.trojanWsHostMode || "peer";
  const peer = queryValue(searchParams, "peer");
  const sni = queryValue(searchParams, "sni");

  if (mode === "custom" && options.trojanWsHost) {
    return options.trojanWsHost;
  }

  if (mode === "sni") {
    return options.trojanSniOverride || sni || peer || fallbackHost;
  }

  return peer || sni || options.trojanWsHost || fallbackHost;
}

function parseTrojanUri(line, options) {
  const url = new URL(line);
  const searchParams = url.searchParams;
  const name = decodeURIComponent((url.hash || "").replace(/^#/, "")) || `${url.hostname}:${url.port}`;
  const host = url.hostname;
  const proxyPort = Number(url.port);
  const password = decodeURIComponent(url.username || "");
  const sni = options.trojanSniOverride || queryValue(searchParams, "sni") || queryValue(searchParams, "peer") || host;
  const params = [
    `password=${encodeSurgeValue(password)}`,
    `sni=${encodeSurgeValue(sni)}`,
    `skip-cert-verify=${parseMaybeBoolean(queryValue(searchParams, "allowInsecure")) === true}`
  ];

  const network = String(queryValue(searchParams, "type") || queryValue(searchParams, "network")).toLowerCase();
  const shouldEnableWs = options.forceTrojanWs || network === "ws" || network === "websocket";

  if (shouldEnableWs) {
    const wsPath = ensureLeadingSlash(queryValue(searchParams, "path") || options.trojanWsPath || "/images");
    const wsHost = resolveTrojanWsHost(searchParams, options, host);
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
    line: `${name} = trojan, ${host}, ${proxyPort}, ${params.join(", ")}`
  };
}

function convertSubscription(content, options) {
  const body = detectSubscriptionBody(content);
  const lines = splitLines(body);
  const warnings = [];
  const proxies = [];
  const usedNames = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    try {
      let parsed = null;

      if (line.indexOf("vmess://") === 0) {
        parsed = parseVmessUri(line, options);
      } else if (line.indexOf("ss://") === 0) {
        parsed = parseShadowsocksUri(line, options);
      } else if (line.indexOf("trojan://") === 0) {
        parsed = parseTrojanUri(line, options);
      } else if (line.indexOf(" = ") > 0 && /(vmess|ss|trojan),/.test(line)) {
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
      const finalLine = parsed.type === "surge"
        ? parsed.line.replace(/^([^=]+)/, uniqueName)
        : parsed.line.replace(parsed.name, uniqueName);

      proxies.push({
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
    `# Total: ${proxies.length}`,
    options.subscriptionUrl ? `# Source: ${options.subscriptionUrl}` : null,
    "[Proxy]"
  ].filter(Boolean).join("\n");

  return {
    result: `${header}\n${proxies.map((item) => item.line).join("\n")}\n`,
    proxies,
    warnings
  };
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function fetchSubscription(targetUrl) {
  return new Promise((resolve, reject) => {
    const client = String(targetUrl).startsWith("https://") ? https : http;

    const req = client.get(targetUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        accept: "*/*"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchSubscription(new URL(res.headers.location, targetUrl).toString()));
        res.resume();
        return;
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Upstream request failed with ${res.statusCode}`));
        res.resume();
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });

    req.on("error", reject);
  });
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

process.on("uncaughtException", (error) => {
  console.error("uncaughtException", error && error.stack ? error.stack : error);
});

process.on("unhandledRejection", (error) => {
  console.error("unhandledRejection", error && error.stack ? error.stack : error);
});

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

      if (!String(sourceText || "").trim()) {
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
    json(res, 500, { error: error && error.message ? error.message : "Unexpected server error." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Surge Subscription Converter is listening on http://0.0.0.0:${port}`);
});
