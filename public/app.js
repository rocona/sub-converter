const form = document.querySelector("#convert-form");
const subscriptionUrlInput = document.querySelector("#subscription-url");
const generatedUrlInput = document.querySelector("#generated-url");
const statusText = document.querySelector("#status-text");
const previewStatus = document.querySelector("#preview-status");
const copyLinkButton = document.querySelector("#copy-link");
const openLinkButton = document.querySelector("#open-link");
const copyResultButton = document.querySelector("#copy-result");
const downloadResultButton = document.querySelector("#download-result");
const resultBlock = document.querySelector("#result");
const warningsBox = document.querySelector("#warnings");

const metricTotal = document.querySelector("#metric-total");
const metricInput = document.querySelector("#metric-input");
const metricVmess = document.querySelector("#metric-vmess");
const metricSs = document.querySelector("#metric-ss");
const metricTrojan = document.querySelector("#metric-trojan");
const metricHysteria2 = document.querySelector("#metric-hysteria2");

let latestGeneratedUrl = "";
let latestResult = "[Proxy]\n";

function setMetrics(stats = { total: 0, inputTotal: 0, vmess: 0, ss: 0, trojan: 0, hysteria2: 0 }) {
  metricTotal.textContent = stats.total ?? 0;
  metricInput.textContent = stats.inputTotal ?? 0;
  metricVmess.textContent = stats.vmess ?? 0;
  metricSs.textContent = stats.ss ?? 0;
  metricTrojan.textContent = stats.trojan ?? 0;
  metricHysteria2.textContent = stats.hysteria2 ?? 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    subscriptionUrl: subscriptionUrlInput.value.trim(),
    forceTrojanWs: true,
    trojanWsPath: "/images",
    trojanWsHostMode: "custom",
    trojanWsHost: "fast.usfaster.top",
    trojanSniOverride: "",
    enableUdpRelay: true,
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
  url.searchParams.set("forceTrojanWs", "true");
  url.searchParams.set("trojanWsPath", payload.trojanWsPath);
  url.searchParams.set("trojanWsHostMode", payload.trojanWsHostMode);
  url.searchParams.set("trojanWsHost", payload.trojanWsHost);
  url.searchParams.set("enableUdpRelay", "true");
  url.searchParams.set("skipMetaEntries", "true");

  latestGeneratedUrl = url.toString();
  generatedUrlInput.value = latestGeneratedUrl;
  return latestGeneratedUrl;
}

async function convertSubscription(event) {
  event.preventDefault();

  const payload = buildPayload();
  if (!payload.subscriptionUrl) {
    statusText.textContent = "请先粘贴原始订阅链接。";
    previewStatus.textContent = "等待输入原始订阅链接。";
    return;
  }

  updateGeneratedUrl();
  statusText.textContent = "新的订阅 URL 已生成。";
  previewStatus.textContent = "正在拉取原始订阅并生成预览...";
  resultBlock.textContent = "[Proxy]\n# Loading preview...";
  renderWarnings([]);

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
      throw new Error(data.error || "转换失败。");
    }

    latestResult = data.result || "[Proxy]\n";
    latestGeneratedUrl = data.generatedUrl || latestGeneratedUrl;
    generatedUrlInput.value = latestGeneratedUrl;
    resultBlock.textContent = latestResult;
    setMetrics(data.stats);
    renderWarnings(data.warnings);
    previewStatus.textContent = `原始 ${data.stats.inputTotal} 条，输出 ${data.stats.total} 条，过滤元信息 ${data.stats.skippedMetaEntries} 条。`;
  } catch (error) {
    latestResult = "[Proxy]\n";
    resultBlock.textContent = `[Proxy]\n# Error\n# ${error.message}`;
    setMetrics();
    renderWarnings([error.message]);
    previewStatus.textContent = "转换结果预览失败。";
  }
}

subscriptionUrlInput.addEventListener("input", () => {
  updateGeneratedUrl();
  if (!subscriptionUrlInput.value.trim()) {
    statusText.textContent = "等待输入原始订阅链接。";
  }
});

copyLinkButton.addEventListener("click", async () => {
  const generatedUrl = updateGeneratedUrl();
  if (!generatedUrl) {
    statusText.textContent = "请先粘贴原始订阅链接。";
    return;
  }

  await navigator.clipboard.writeText(generatedUrl);
  statusText.textContent = "新的订阅 URL 已复制到剪贴板。";
});

openLinkButton.addEventListener("click", () => {
  const generatedUrl = updateGeneratedUrl();
  if (!generatedUrl) {
    statusText.textContent = "请先粘贴原始订阅链接。";
    return;
  }

  window.open(generatedUrl, "_blank", "noopener,noreferrer");
});

copyResultButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(latestResult);
  previewStatus.textContent = "转换结果已复制到剪贴板。";
});

downloadResultButton.addEventListener("click", () => {
  const blob = new Blob([latestResult], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "surge-proxies.conf";
  anchor.click();
  URL.revokeObjectURL(url);
  previewStatus.textContent = "已生成下载文件。";
});

form.addEventListener("submit", convertSubscription);
