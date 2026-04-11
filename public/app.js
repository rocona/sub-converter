const form = document.querySelector("#convert-form");
const resultBlock = document.querySelector("#result");
const warningsBox = document.querySelector("#warnings");
const statusText = document.querySelector("#status-text");
const fillDemoButton = document.querySelector("#fill-demo");
const copyButton = document.querySelector("#copy-result");
const downloadButton = document.querySelector("#download-result");

const metricTotal = document.querySelector("#metric-total");
const metricVmess = document.querySelector("#metric-vmess");
const metricSs = document.querySelector("#metric-ss");
const metricTrojan = document.querySelector("#metric-trojan");

const defaultExample =
  "https://dy11.baipiaoyes.com/api/v1/client/subscribe?token=23dc5cb18d089cd44f2002256d5bf6a6";

let latestResult = "[Proxy]\n";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setMetrics(stats = { total: 0, vmess: 0, ss: 0, trojan: 0 }) {
  metricTotal.textContent = stats.total ?? 0;
  metricVmess.textContent = stats.vmess ?? 0;
  metricSs.textContent = stats.ss ?? 0;
  metricTrojan.textContent = stats.trojan ?? 0;
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

async function convertSubscription(event) {
  event.preventDefault();

  statusText.textContent = "正在拉取订阅并转换成 Surge 配置...";
  resultBlock.textContent = "[Proxy]\n# Converting...";
  renderWarnings([]);

  const payload = {
    subscriptionUrl: document.querySelector("#subscription-url").value.trim(),
    rawContent: document.querySelector("#raw-content").value.trim(),
    forceTrojanWs: document.querySelector("#force-trojan-ws").checked,
    trojanWsPath: document.querySelector("#trojan-ws-path").value.trim(),
    trojanWsHostMode: document.querySelector("#trojan-ws-host-mode").value,
    trojanWsHost: document.querySelector("#trojan-ws-host").value.trim(),
    trojanSniOverride: document.querySelector("#trojan-sni-override").value.trim(),
    enableUdpRelay: document.querySelector("#enable-udp-relay").checked
  };

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
    resultBlock.textContent = data.result;
    setMetrics(data.stats);
    renderWarnings(data.warnings);
    statusText.textContent = `已生成 ${data.stats.total} 条代理节点，可直接复制到 Surge 使用。`;
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
  statusText.textContent = "已填入当前机场示例。你可以直接点击开始转换。";
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(latestResult);
  statusText.textContent = "结果已复制到剪贴板。";
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
