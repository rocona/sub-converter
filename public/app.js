const sourceDisplayInput = document.querySelector("#source-display");
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

async function loadDefaultSubscription() {
  statusText.textContent = "正在读取默认配置...";

  try {
    const response = await fetch("/api/default", {
      headers: {
        accept: "application/json"
      }
    });
    const data = await response.json();

    if (!response.ok || !data.configured) {
      throw new Error(data.error || "默认订阅还没有在服务端配置好。");
    }

    sourceDisplayInput.value = data.sourceDisplay || "服务端默认订阅";
    generatedUrlInput.value = data.generatedUrl || "";
    latestGeneratedUrl = data.generatedUrl || "";
    statusText.textContent = "新的订阅 URL 已生成，直接复制回 Surge 即可。";
  } catch (error) {
    sourceDisplayInput.value = "";
    generatedUrlInput.value = "";
    latestGeneratedUrl = "";
    statusText.textContent = error.message || "读取默认配置失败。";
  }
}

async function loadDefaultPreview() {
  previewStatus.textContent = "正在生成默认预览...";
  resultBlock.textContent = "[Proxy]\n# Loading preview...";
  renderWarnings([]);

  try {
    const response = await fetch("/api/default-preview", {
      headers: {
        accept: "application/json"
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "默认预览生成失败。");
    }

    latestResult = data.result || "[Proxy]\n";
    resultBlock.textContent = latestResult;
    setMetrics(data.stats);
    renderWarnings(data.warnings);
    previewStatus.textContent = `原始 ${data.stats.inputTotal} 条，输出 ${data.stats.total} 条，过滤元信息 ${data.stats.skippedMetaEntries} 条。`;
  } catch (error) {
    latestResult = "[Proxy]\n";
    resultBlock.textContent = `[Proxy]\n# Error\n# ${error.message}`;
    setMetrics();
    renderWarnings([error.message]);
    previewStatus.textContent = "默认预览生成失败。";
  }
}

copyLinkButton.addEventListener("click", async () => {
  if (!latestGeneratedUrl) {
    statusText.textContent = "新的订阅 URL 还没有准备好。";
    return;
  }

  await navigator.clipboard.writeText(latestGeneratedUrl);
  statusText.textContent = "新的订阅 URL 已复制到剪贴板。";
});

openLinkButton.addEventListener("click", () => {
  if (!latestGeneratedUrl) {
    statusText.textContent = "新的订阅 URL 还没有准备好。";
    return;
  }

  window.open(latestGeneratedUrl, "_blank", "noopener,noreferrer");
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

await loadDefaultSubscription();
await loadDefaultPreview();
