const form = document.querySelector("#convert-form");
const subscriptionUrlInput = document.querySelector("#subscription-url");
const statusText = document.querySelector("#status-text");
const previewStatus = document.querySelector("#preview-status");
const resultBlock = document.querySelector("#result");

function buildPayload() {
  return {
    subscriptionUrl: subscriptionUrlInput.value.trim()
  };
}

async function convertSubscription(event) {
  event.preventDefault();

  const payload = buildPayload();
  if (!payload.subscriptionUrl) {
    statusText.textContent = "请先粘贴原始订阅链接。";
    previewStatus.textContent = "等待输入原始订阅链接。";
    resultBlock.textContent = "# Node preview will appear here.";
    return;
  }

  statusText.textContent = "正在拉取原始订阅...";
  previewStatus.textContent = "正在转换节点列表...";
  resultBlock.textContent = "# Loading preview...";

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

    resultBlock.textContent = data.result || "";
    statusText.textContent = "转换完成。";
    previewStatus.textContent = `输入 ${data.stats.inputTotal} 条，输出 ${data.stats.total} 条节点。`;
  } catch (error) {
    resultBlock.textContent = `# Error\n# ${error.message}`;
    statusText.textContent = "转换失败。";
    previewStatus.textContent = error.message;
  }
}

subscriptionUrlInput.addEventListener("input", () => {
  if (!subscriptionUrlInput.value.trim()) {
    statusText.textContent = "等待输入原始订阅链接。";
    previewStatus.textContent = "这里只显示节点列表预览。";
    resultBlock.textContent = "# Node preview will appear here.";
  }
});

form.addEventListener("submit", convertSubscription);
