const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

const insightsMain = document.getElementById("insightsMain");

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : text;
    return div.innerHTML;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function init() {

    const params = new URLSearchParams(window.location.search);
    const docId = params.get("doc");

    if (!docId) {
        insightsMain.innerHTML = `<div class="search-loading">No document selected.</div>`;
        return;
    }

    const [docRes, tablesRes] = await Promise.all([
        authedFetch(`${API_URL}/api/documents/${docId}`).then((r) => r.json()).catch(() => null),
        authedFetch(`${API_URL}/api/documents/${docId}/tables`).then((r) => r.json()).catch(() => null),
    ]);

    if (!docRes || !docRes.success) {
        insightsMain.innerHTML = `<div class="search-loading">Document not found.</div>`;
        return;
    }

    const doc = docRes.document;
    const tables = (tablesRes && tablesRes.success) ? tablesRes.tables : [];
    const tablePages = [...new Set(tables.map((t) => t.page_number))].sort((a, b) => a - b);

    insightsMain.innerHTML = `
        <div class="insights-header">
            <div>
                <h1>${escapeHTML(doc.original_filename)}</h1>
                <span class="status-badge status-${doc.status}">${doc.status}</span>
            </div>
            <a href="chat.html?doc=${doc.id}" class="primary-button" style="text-decoration:none;">Open / Chat</a>
        </div>

        <div class="insights-grid">

            <div>
                <div class="insights-card">
                    <h2>Summary</h2>
                    ${doc.summary_status === "ready"
                        ? `<p>${escapeHTML(doc.summary_text)}</p>`
                        : doc.summary_status === "failed"
                            ? `<p style="color:var(--danger)">Summary generation failed.</p>`
                            : `<p style="color:var(--muted)">Summary is still being generated.</p>`}
                </div>

                ${doc.summary_key_points && doc.summary_key_points.length ? `
                    <div class="insights-card">
                        <h2>Key Points</h2>
                        <ul>${doc.summary_key_points.map((p) => `<li>${escapeHTML(p)}</li>`).join("")}</ul>
                    </div>
                ` : ""}

                ${doc.summary_topics && doc.summary_topics.length ? `
                    <div class="insights-card">
                        <h2>Common Topics</h2>
                        <div>${doc.summary_topics.map((t) => `<span class="topic-chip">${escapeHTML(t)}</span>`).join("")}</div>
                    </div>
                ` : ""}

                <div class="insights-card">
                    <h2>Tables (${tables.length})</h2>
                    ${tablePages.length ? `
                        <p style="color:var(--muted); font-size:12px; margin-bottom:8px;">Pages containing tables:</p>
                        <div>${tablePages.map((p) => `<span class="table-page-chip">Page ${p}</span>`).join("")}</div>
                    ` : `<p style="color:var(--muted)">No tables detected in this document.</p>`}
                </div>
            </div>

            <div>
                <div class="insights-card">
                    <h2>Overview</h2>
                    <div class="stat-row"><span class="stat-label">Pages</span><span class="stat-value">${doc.page_count ?? "—"}</span></div>
                    <div class="stat-row"><span class="stat-label">Chunks</span><span class="stat-value">${doc.chunk_count ?? "—"}</span></div>
                    <div class="stat-row"><span class="stat-label">Tables found</span><span class="stat-value">${doc.table_count ?? 0}</span></div>
                    <div class="stat-row"><span class="stat-label">File size</span><span class="stat-value">${formatBytes(doc.file_size_bytes)}</span></div>
                    <div class="stat-row"><span class="stat-label">Uploaded</span><span class="stat-value">${new Date(doc.created_at).toLocaleDateString()}</span></div>
                    <div class="stat-row"><span class="stat-label">Processing status</span><span class="stat-value">${doc.status}</span></div>
                    <div class="stat-row"><span class="stat-label">Summary status</span><span class="stat-value">${doc.summary_status}</span></div>
                    <div class="stat-row"><span class="stat-label">Tables status</span><span class="stat-value">${doc.tables_status}</span></div>
                </div>
            </div>

        </div>
    `;
}

init();
