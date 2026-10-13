const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

const el = (id) => document.getElementById(id);

async function loadSettings() {
    const response = await authedFetch(`${API_URL}/api/settings`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;

    el("denseTopK").value = data.dense_top_k;
    el("bm25TopK").value = data.bm25_top_k;
    el("rerankTopK").value = data.rerank_top_k;
    el("finalChunks").value = data.final_chunks;
    el("rerankerEnabled").checked = data.reranker_enabled;
    el("maxContextChars").innerText = data.max_context_chars.toLocaleString();
}

el("saveSettingsBtn").addEventListener("click", async () => {

    const payload = {
        dense_top_k: parseInt(el("denseTopK").value, 10),
        bm25_top_k: parseInt(el("bm25TopK").value, 10),
        rerank_top_k: parseInt(el("rerankTopK").value, 10),
        final_chunks: parseInt(el("finalChunks").value, 10),
        reranker_enabled: el("rerankerEnabled").checked,
    };

    const status = el("saveStatus");
    status.innerText = "Saving…";
    status.style.color = "var(--muted)";

    try {
        const response = await authedFetch(`${API_URL}/api/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (response.ok) {
            status.innerText = "Saved";
            toastSuccess("Retrieval settings updated.");
            status.style.color = "var(--status-green-fg)";
            await loadSettings();
        } else {
            const data = await response.json().catch(() => ({}));
            status.innerText = data.detail ? "Invalid value(s) — not saved" : "Failed to save";
            status.style.color = "var(--danger)";
        }
    } catch (error) {
        console.error("SETTINGS SAVE ERROR:", error);
        status.innerText = "Could not connect to the backend";
        status.style.color = "var(--danger)";
    }

    setTimeout(() => { status.innerText = ""; }, 3000);
});

// Theme row mirrors the topbar toggle so it's discoverable from Settings too.
function syncThemeButtonLabel() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    el("settingsThemeBtn").innerText = current === "dark" ? "Switch to light mode" : "Switch to dark mode";
}

el("settingsThemeBtn").addEventListener("click", () => {
    document.getElementById("themeToggle").click();
    syncThemeButtonLabel();
});

document.addEventListener("DOMContentLoaded", syncThemeButtonLabel);

loadSettings();
