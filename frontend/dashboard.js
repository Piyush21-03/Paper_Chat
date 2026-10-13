const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

let documents = [];
let searchTerm = "";
let searchDebounce = null;
let activeFilter = "all";


// ========================================
// Elements
// ========================================

const fileInput = document.getElementById("fileInput");
const uploadTrigger = document.getElementById("uploadTrigger");
const searchInput = document.getElementById("searchInput");
const uploadProgressList = document.getElementById("uploadProgressList");
const documentGrid = document.getElementById("documentGrid");
const emptyState = document.getElementById("emptyState");
const filterEmptyState = document.getElementById("filterEmptyState");
const filterChips = document.getElementById("filterChips");
const summaryModal = document.getElementById("summaryModal");
const summaryModalBody = document.getElementById("summaryModalBody");
const tablesModal = document.getElementById("tablesModal");
const tablesModalBody = document.getElementById("tablesModalBody");


// ========================================
// Fetch + Render Documents
// ========================================

async function fetchDocuments() {

    try {

        const url = new URL(`${API_URL}/api/documents`);

        if (searchTerm) {
            url.searchParams.set("search", searchTerm);
        }

        const response = await authedFetch(url);
        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            documents = data.documents;
            renderDocuments();
        }

    } catch (error) {

        console.error("FETCH DOCUMENTS ERROR:", error);

    }

}


function renderDocuments() {

    emptyState.hidden = documents.length !== 0;

    const filtered = activeFilter === "all"
        ? documents
        : documents.filter((doc) => {
            if (activeFilter === "processing") return doc.status === "uploaded" || doc.status === "processing";
            return doc.status === activeFilter;
        });

    filterEmptyState.hidden = !(documents.length !== 0 && filtered.length === 0);

    documentGrid.innerHTML = filtered.map(renderDocCard).join("");

    filtered.forEach((doc) => {

        const card = document.getElementById(`doc-${doc.id}`);
        if (!card) return;

        card.querySelector(".open-btn")?.addEventListener("click", () => {
            window.location.href = `chat.html?doc=${doc.id}`;
        });

        card.querySelector(".rename-btn")?.addEventListener("click", () => {
            startRename(doc);
        });

        card.querySelector(".delete-btn")?.addEventListener("click", () => {
            deleteDocument(doc);
        });

        card.querySelector(".retry-btn")?.addEventListener("click", () => {
            retryDocument(doc);
        });

        card.querySelector(".insights-btn")?.addEventListener("click", () => {
            window.location.href = `document.html?doc=${doc.id}`;
        });

        card.querySelector(".summary-btn")?.addEventListener("click", () => {
            openSummaryModal(doc);
        });

        card.querySelector(".tables-btn")?.addEventListener("click", () => {
            openTablesModal(doc);
        });

    });

}

filterChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    filterChips.querySelectorAll(".filter-chip").forEach((c) => c.classList.toggle("active", c === chip));
    renderDocuments();
});


// Ordered pipeline stages (matches backend jobs.py / rag.py on_stage names).
const PIPELINE_STAGES = [
    { key: "extracting_text", label: "Extracting text" },
    { key: "chunking", label: "Chunking" },
    { key: "embedding", label: "Generating embeddings" },
    { key: "indexing", label: "Indexing" },
    { key: "summarizing", label: "Creating summary" },
    { key: "extracting_tables", label: "Extracting tables" },
];

function stageLabel(key) {
    const found = PIPELINE_STAGES.find((s) => s.key === key);
    return found ? found.label : key;
}

// Small ordered stepper: done stages get a check, the current one is
// highlighted, later ones are dimmed. aria-live so screen readers hear
// progress changes without stealing focus.
function renderStageStepper(currentKey) {
    const currentIndex = PIPELINE_STAGES.findIndex((s) => s.key === currentKey);
    return `
        <ol class="stage-stepper" aria-live="polite" aria-label="Processing progress">
            ${PIPELINE_STAGES.map((s, i) => {
                const state = currentIndex === -1 ? "pending" : i < currentIndex ? "done" : i === currentIndex ? "current" : "pending";
                const mark = state === "done" ? "✓" : state === "current" ? "●" : "○";
                return `<li class="stage stage-${state}"><span class="stage-mark" aria-hidden="true">${mark}</span> ${s.label}${state === "current" ? "…" : ""}</li>`;
            }).join("")}
        </ol>
    `;
}

function renderDocCard(doc) {

    const statusLabel = {
        uploaded: "Queued",
        processing: "Processing",
        ready: "Ready",
        failed: "Failed"
    }[doc.status] || doc.status;

    const isReady = doc.status === "ready";

    return `
        <div class="doc-card" id="doc-${doc.id}">

            <div class="doc-card-top">
                <div class="doc-name" data-role="name">${escapeHTML(doc.original_filename)}</div>
                <span class="status-badge status-${doc.status}">${statusLabel}</span>
            </div>

            <div class="doc-meta">
                <span>${doc.page_count != null ? doc.page_count + " pages" : "—"}</span>
                <span>${doc.chunk_count != null ? doc.chunk_count + " chunks" : "—"}</span>
                <span>${formatBytes(doc.file_size_bytes)}</span>
                <span>${formatDate(doc.created_at)}</span>
            </div>

            ${doc.status === "processing" ? renderStageStepper(doc.processing_stage) : ""}
            ${doc.status === "uploaded" ? `<div class="muted-note" aria-live="polite">Queued — waiting to start…</div>` : ""}
            ${doc.status === "ready" && doc.processing_stage ? `<div class="muted-note" aria-live="polite">Ready to chat · ${stageLabel(doc.processing_stage)}…</div>` : ""}

            ${doc.status === "failed" ? `
                <div class="doc-error" role="alert">
                    ${doc.failed_stage ? `<strong>Failed during: ${escapeHTML(stageLabel(doc.failed_stage))}.</strong> ` : ""}${escapeHTML(doc.error_message || "Processing failed.")}
                </div>` : ""}

            ${doc.status === "ready" ? `
                <div class="doc-summary-line">
                    ${doc.summary_status === "ready"
                        ? `<span>📝 ${escapeHTML((doc.summary_text || "").slice(0, 110))}${(doc.summary_text || "").length > 110 ? "…" : ""}</span>`
                        : doc.summary_status === "failed"
                            ? `<span class="muted-note">Summary unavailable</span>`
                            : `<span class="muted-note">Generating summary…</span>`}
                    ${doc.table_count ? `<span class="table-count-badge">${doc.table_count} table${doc.table_count === 1 ? "" : "s"}</span>` : ""}
                </div>
            ` : ""}

            <div class="doc-actions">
                <button class="open-btn" ${isReady ? "" : "disabled"}>Open / Chat</button>
                ${isReady ? `<button class="insights-btn">Insights</button>` : ""}
                ${isReady ? `<button class="summary-btn">Summary</button>` : ""}
                ${isReady ? `<button class="tables-btn">Tables</button>` : ""}
                ${doc.status === "failed" ? `<button class="retry-btn">Retry</button>` : ""}
                <button class="rename-btn">Rename</button>
                <button class="delete-btn">Delete</button>
            </div>

        </div>
    `;

}


// ========================================
// Retry
// ========================================

async function retryDocument(doc) {

    try {
        const response = await authedFetch(`${API_URL}/api/documents/${doc.id}/retry`, { method: "POST" });
        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            toastSuccess("Reprocessing started.");
            fetchDocuments();
        } else {
            toastError(data.message || "Could not retry processing.");
        }
    } catch (error) {
        console.error("RETRY ERROR:", error);
        toastError("Could not connect to the backend.");
    }

}


// ========================================
// Summary / Tables modals
// ========================================

function openSummaryModal(doc) {

    if (doc.summary_status === "pending") {
        summaryModalBody.innerHTML = `<p>Summary is still being generated. Check back shortly.</p>`;
    } else if (doc.summary_status === "failed") {
        summaryModalBody.innerHTML = `<p>Summary generation failed: ${escapeHTML(doc.summary_error || "unknown error")}</p>`;
    } else {
        summaryModalBody.innerHTML = `
            <h4>Overview</h4>
            <p>${escapeHTML(doc.summary_text || "No summary available.")}</p>
            ${doc.summary_key_points && doc.summary_key_points.length ? `
                <h4>Key Points</h4>
                <ul>${doc.summary_key_points.map((p) => `<li>${escapeHTML(p)}</li>`).join("")}</ul>
            ` : ""}
            ${doc.summary_topics && doc.summary_topics.length ? `
                <h4>Topics</h4>
                <p>${doc.summary_topics.map(escapeHTML).join(" · ")}</p>
            ` : ""}
        `;
    }

    summaryModal.hidden = false;
}

async function openTablesModal(doc) {

    tablesModalBody.innerHTML = `<p>Loading…</p>`;
    tablesModal.hidden = false;

    const response = await authedFetch(`${API_URL}/api/documents/${doc.id}/tables`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success || data.tables.length === 0) {
        tablesModalBody.innerHTML = `<p>No tables detected in this document.</p>`;
        return;
    }

    tablesModalBody.innerHTML = data.tables.map((t) => `
        <div class="table-card">
            <div class="table-card-header">
                <span>Page ${t.page_number} · ${t.row_count}×${t.col_count}</span>
                <span class="table-card-links">
                    <button class="link-btn" data-url="${API_URL}/api/documents/${doc.id}/tables/${t.id}/csv" data-filename="table_page${t.page_number}.csv">CSV</button>
                    ${t.has_xlsx ? `<button class="link-btn" data-url="${API_URL}/api/documents/${doc.id}/tables/${t.id}/xlsx" data-filename="table_page${t.page_number}.xlsx">XLSX</button>` : ""}
                </span>
            </div>
            ${t.preview ? `
                <table class="table-preview">
                    ${t.preview.map((row) => `<tr>${row.map((cell) => `<td>${escapeHTML(cell || "")}</td>`).join("")}</tr>`).join("")}
                </table>
            ` : ""}
        </div>
    `).join("");

    tablesModalBody.querySelectorAll(".link-btn").forEach((btn) => {
        btn.addEventListener("click", () => downloadAuthed(btn.dataset.url, btn.dataset.filename));
    });
}

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => { summaryModal.hidden = true; tablesModal.hidden = true; });
});
[summaryModal, tablesModal].forEach((modal) => {
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
});

// Escape closes whichever of these modals is currently open. Guarded so
// re-including this script never double-binds the listener. This is
// independent of the rename-input's own Escape handling (that input
// isn't part of either modal).
if (!window.__paperchatDashboardEscapeBound) {
    window.__paperchatDashboardEscapeBound = true;
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (summaryModal && !summaryModal.hidden) summaryModal.hidden = true;
        if (tablesModal && !tablesModal.hidden) tablesModal.hidden = true;
    });
}


// ========================================
// Rename (inline)
// ========================================

function startRename(doc) {

    const card = document.getElementById(`doc-${doc.id}`);
    const nameEl = card.querySelector('[data-role="name"]');

    nameEl.outerHTML = `
        <input
            type="text"
            class="doc-name-input"
            data-role="name-input"
            value="${escapeHTML(doc.original_filename)}"
        >
    `;

    const input = card.querySelector('[data-role="name-input"]');
    input.focus();
    input.select();

    const commit = async () => {

        const newName = input.value.trim();

        if (!newName || newName === doc.original_filename) {
            renderDocuments();
            return;
        }

        try {

            const response = await authedFetch(
                `${API_URL}/api/documents/${doc.id}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: newName })
                }
            );

            const data = await response.json().catch(() => ({}));

            if (response.ok && data.success) {
                doc.original_filename = data.document.original_filename;
            }

        } catch (error) {

            console.error("RENAME ERROR:", error);

        }

        renderDocuments();

    };

    input.addEventListener("blur", commit);

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") input.blur();
        if (event.key === "Escape") { input.value = doc.original_filename; input.blur(); }
    });

}


// ========================================
// Delete
// ========================================

async function deleteDocument(doc) {

    if (!confirm(`Delete "${doc.original_filename}"? This cannot be undone.`)) {
        return;
    }

    try {

        const response = await authedFetch(
            `${API_URL}/api/documents/${doc.id}`,
            { method: "DELETE" }
        );

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            documents = documents.filter((item) => item.id !== doc.id);
            renderDocuments();
            toastSuccess("Document deleted.");
        } else {
            toastError(data.message || "Could not delete this document.");
        }

    } catch (error) {

        console.error("DELETE ERROR:", error);
        toastError("Could not connect to the backend.");

    }

}


// ========================================
// Upload (with progress)
// ========================================

uploadTrigger.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {

    const files = Array.from(fileInput.files || []);
    files.forEach(uploadFile);
    fileInput.value = "";

});


function uploadFile(file) {

    const progressId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const item = document.createElement("div");
    item.className = "upload-progress-item";
    item.id = progressId;
    item.innerHTML = `
        <div class="row">
            <span class="name">${escapeHTML(file.name)}</span>
            <span class="pct">0%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>
    `;
    uploadProgressList.appendChild(item);

    const pctEl = item.querySelector(".pct");
    const barEl = item.querySelector(".bar-fill");

    const formData = new FormData();
    formData.append("file", file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/documents/upload`);
    const _uploadToken = localStorage.getItem("paperchat-token");
    if (_uploadToken) xhr.setRequestHeader("Authorization", `Bearer ${_uploadToken}`);

    xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;
        const pct = Math.round((event.loaded / event.total) * 100);
        pctEl.innerText = `${pct}%`;
        barEl.style.width = `${pct}%`;
    });

    xhr.addEventListener("load", () => {

        if (xhr.status === 401) {
            clearSession();
            window.location.href = "login.html?expired=1";
            return;
        }

        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_) {}

        if (xhr.status >= 200 && xhr.status < 300 && data.success) {

            pctEl.innerText = "Uploaded";
            barEl.style.width = "100%";
            setTimeout(() => item.remove(), 1200);
            toastSuccess(`${file.name} uploaded — processing started.`);
            fetchDocuments();

        } else {

            item.classList.add("error");
            item.insertAdjacentHTML(
                "beforeend",
                `<p class="error-text">${escapeHTML(data.message || "Upload failed.")}</p>`
            );

        }

    });

    xhr.addEventListener("error", () => {
        item.classList.add("error");
        item.insertAdjacentHTML(
            "beforeend",
            `<p class="error-text">Could not connect to the backend.</p>`
        );
    });

    xhr.send(formData);

}


// ========================================
// Search
// ========================================

searchInput.addEventListener("input", () => {

    clearTimeout(searchDebounce);

    searchDebounce = setTimeout(() => {
        searchTerm = searchInput.value.trim();
        fetchDocuments();
    }, 300);

});


// ========================================
// Poll for status updates (uploaded/processing docs)
// ========================================

setInterval(() => {

    const hasPending = documents.some(
        (doc) =>
            doc.status === "uploaded" ||
            doc.status === "processing" ||
            doc.summary_status === "pending" ||
            doc.tables_status === "pending"
    );

    if (hasPending) fetchDocuments();

}, 3000);


// ========================================
// Helpers
// ========================================

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString) {
    const date = new Date(isoString + (isoString.endsWith("Z") ? "" : "Z"));
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}


// ========================================
// Init
// ========================================

fetchDocuments();
