const sourceDisplayInput = document.querySelector("#source-display");
const generatedUrlInput = document.querySelector("#generated-url");
const statusText = document.querySelector("#status-text");
const copyLinkButton = document.querySelector("#copy-link");
const openLinkButton = document.querySelector("#open-link");

let latestGeneratedUrl = "";

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

loadDefaultSubscription();
