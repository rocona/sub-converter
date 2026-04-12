const form = document.querySelector("#convert-form");
const resultBlock = document.querySelector("#result");
const warningsBox = document.querySelector("#warnings");
const statusText = document.querySelector("#status-text");
const fillDemoButton = document.querySelector("#fill-demo");
const copyButton = document.querySelector("#copy-result");
const downloadButton = document.querySelector("#download-result");
const generateLinkButton = document.querySelector("#generate-link");
const copyLinkButton = document.querySelector("#copy-link");
const openLinkButton = document.querySelector("#open-link");
const generatedUrlInput = document.querySelector("#generated-url");

const metricTotal = document.querySelector("#metric-total");
const metricInput = document.querySelector("#metric-input");
const metricVmess = document.querySelector("#metric-vmess");
const metricSs = document.querySelector("#metric-ss");
const metricTrojan = document.querySelector("#metric-trojan");
const metricHysteria2 = document.querySelector("#metric-hysteria2");

const defaultExample =
  "https://dy11.baipiaoyes.com/api/v1/client/subscribe?token=23dc5cb18d089cd44f2002256d5bf6a6";

let latestResult = "[Proxy]\n";
let latestGeneratedUrl = "";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setMetrics(stats = { total: 0, inputTotal: 0, vmess: 0, ss: 0, trojan: 0, hysteria2: 0 }) {
  metricTotal.textContent = stats.total ?? 0;
  metricInput.textContent = stats.inputTotal ?? 0;
  metricVmess.textContent = stats.vmess ?? 0;
  metricSs.textContent = stats.ss ?? 0;
  metricTrojan.textContent = stats.trojan ?? 0;
  metricHysteria2.textContent = stats.hysteria2 ?? 0;
}

function renderWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    warningsBox.classList.add("hidden");
    warningsBox.innerHTML = "";
    return;
  }

  warningsBox.classList.remove("hidden");
  warningsBox.innerHTML = `
    <strong>转换提示</strong>
    <ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
}

function buildPayload() {
  return {
    subscriptionUrl: document.querySelector("#subscription-url").value.trim(),
    forceTrojanWs: document.querySelector("#force-trojan-ws").checked,
    trojanWsPath: document.querySelector("#trojan-ws-path").value.trim(),
    trojanWsHostMode: document.querySelector("#trojan-ws-host-mode").value,
    trojanWsHost: document.querySelector("#trojan-ws-host").value.trim(),
    trojanSniOverride: document.querySelector("#trojan-sni-override").value.trim(),
    enableUdpRelay: document.querySelector("#enable-udp-relay").checked,
    skipMetaEntries: true
  };
}

function updateGeneratedUrl() {
  const payload = buildPayload();
  if (!payload.subscriptionUrl) {
    latestGeneratedUrl = "";
    generatedUrlInput.value = "";
    return "";
  }

  const url = new URL("/sub", window.location.origin);
  url.searchParams.set("url", payload.subscriptionUrl);
  url.searchParams.set("forceTrojanWs", String(payload.forceTrojanWs));
  url.searchParams.set("trojanWsPath", payload.trojanWsPath || "/images");
  url.searchParams.set("trojanWsHostMode", payload.trojanWsHostMode || "peer");
  if (payload.trojanWsHost) {
    url.searchParams.set("trojanWsHost", payload.trojanWsHost);
  }
  if (payload.trojanSniOverride) {
    url.searchParams.set("trojanSniOverride", payload.trojanSniOverride);
  }
  url.searchParams.set("enableUdpRelay", String(payload.enableUdpRelay));
  url.searchParams.set("skipMetaEntries", "true");

  latestGeneratedUrl = url.toString();
  generatedUrlInput.value = latestGeneratedUrl;
  return latestGeneratedUrl;
}

async function convertSubscription(event) {
  event.preventDefault();

  const generatedUrl = updateGeneratedUrl();

  statusText.textContent = "正在拉取原始订阅，生成新的替换 URL，并预览 Surge 配置...";
  resultBlock.textContent = "[Proxy]\n# Converting...";
  renderWarnings([]);

  const payload = buildPayload();

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "转换失败");
    }

    latestResult = data.result;
    latestGeneratedUrl = data.generatedUrl || generatedUrl;
    generatedUrlInput.value = latestGeneratedUrl;
    resultBlock.textContent = data.result;
    setMetrics(data.stats);
    renderWarnings(data.warnings);
    statusText.textContent = `原始 ${data.stats.inputTotal} 条，输出 ${data.stats.total} 条，过滤元信息 ${data.stats.skippedMetaEntries} 条。新 URL 已生成，可直接替换原订阅链接。`;
  } catch (error) {
    latestResult = "[Proxy]\n";
    resultBlock.textContent = `[Proxy]\n# Error\n# ${error.message}`;
    setMetrics();
    renderWarnings([error.message]);
    statusText.textContent = "转换失败，请检查订阅链接、参数或上游返回内容。";
  }
}

fillDemoButton.addEventListener("click", () => {
  document.querySelector("#subscription-url").value = defaultExample;
  document.querySelector("#trojan-ws-path").value = "/images";
  document.querySelector("#trojan-ws-host-mode").value = "custom";
  document.querySelector("#trojan-ws-host").value = "fast.usfaster.top";
  document.querySelector("#force-trojan-ws").checked = true;
  updateGeneratedUrl();
  statusText.textContent = "已填入当前机场示例。你可以先生成新 URL，也可以直接预览转换结果。";
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(latestResult);
  statusText.textContent = "结果已复制到剪贴板。";
});

generateLinkButton.addEventListener("click", () => {
  const generatedUrl = updateGeneratedUrl();
  if (!generatedUrl) {
    statusText.textContent = "请先输入原始订阅链接。";
    return;
  }

  statusText.textContent = "新的替换 URL 已生成。";
});

copyLinkButton.addEventListener("click", async () => {
  const generatedUrl = updateGeneratedUrl();
  if (!generatedUrl) {
    statusText.textContent = "请先输入原始订阅链接。";
    return;
  }

  await navigator.clipboard.writeText(generatedUrl);
  statusText.textContent = "新的替换 URL 已复制到剪贴板。";
});

openLinkButton.addEventListener("click", () => {
  const generatedUrl = updateGeneratedUrl();
  if (!generatedUrl) {
    statusText.textContent = "请先输入原始订阅链接。";
    return;
  }

  window.open(generatedUrl, "_blank", "noopener,noreferrer");
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([latestResult], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "surge-proxies.conf";
  anchor.click();
  URL.revokeObjectURL(url);
  statusText.textContent = "已生成下载文件。";
});

form.addEventListener("submit", convertSubscription);
document.querySelector("#subscription-url").addEventListener("input", updateGeneratedUrl);
document.querySelector("#trojan-ws-path").addEventListener("input", updateGeneratedUrl);
document.querySelector("#trojan-ws-host-mode").addEventListener("change", updateGeneratedUrl);
document.querySelector("#trojan-ws-host").addEventListener("input", updateGeneratedUrl);
document.querySelector("#trojan-sni-override").addEventListener("input", updateGeneratedUrl);
document.querySelector("#force-trojan-ws").addEventListener("change", updateGeneratedUrl);
document.querySelector("#enable-udp-relay").addEventListener("change", updateGeneratedUrl);

updateGeneratedUrl();
