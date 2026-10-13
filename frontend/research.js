const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

let workspaces = [];
let currentWorkspace = null; // detail object with .documents
let lastCompareMarkdown = "";
let lastSynthesizeText = "";
let lastGapsText = "";

const el = (id) => document.getElementById(id);

async function api(path, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    const response = await authedFetch(`${API_URL}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : text;
    return div.innerHTML;
}

function renderMarkdown(text) {
    return DOMPurify.sanitize(marked.parse(text || ""));
}


// ========================================
// Workspaces
// ========================================

async function loadWorkspaces() {
    const { ok, data } = await api("/api/research/collections");
    if (!ok || !data.success) return;
    workspaces = data.collections;
    renderWorkspaceList();
}

function renderWorkspaceList() {
    const list = el("workspaceList");

    if (workspaces.length === 0) {
        list.innerHTML = `<div class="empty-hint">No workspaces yet. Click + to create one.</div>`;
        return;
    }

    list.innerHTML = workspaces.map((w) => `
        <div class="workspace-item ${currentWorkspace && currentWorkspace.id === w.id ? "active" : ""}" data-id="${w.id}">
            <span>${escapeHTML(w.name)}</span>
            <span class="doc-count">${w.document_count} doc${w.document_count === 1 ? "" : "s"}</span>
        </div>
    `).join("");

    list.querySelectorAll(".workspace-item").forEach((item) => {
        item.addEventListener("click", () => openWorkspace(item.dataset.id));
    });
}

el("newWorkspaceBtn").addEventListener("click", async () => {
    const name = prompt("Workspace name:");
    if (!name || !name.trim()) return;
    const description = prompt("Description (optional):") || null;

    const { ok, data } = await api("/api/research/collections", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description }),
    });

    if (ok && data.success) {
        await loadWorkspaces();
        openWorkspace(data.collection.id);
        toastSuccess(`Workspace "${data.collection.name}" created.`);
    } else {
        toastError(data.message || "Could not create workspace.");
    }
});

async function openWorkspace(id) {
    const { ok, data } = await api(`/api/research/collections/${id}`);
    if (!ok || !data.success) return;

    currentWorkspace = data.collection;
    renderWorkspaceList();
    renderWorkspaceDetail();
}

function renderWorkspaceDetail() {
    if (!currentWorkspace) {
        el("workspaceDetailSection").hidden = true;
        return;
    }

    el("workspaceDetailSection").hidden = false;
    el("workspaceDetailName").innerText = currentWorkspace.name;
    el("workspaceDescription").innerText = currentWorkspace.description || "";

    const docs = currentWorkspace.documents || [];

    el("workspaceDocs").innerHTML = docs.length
        ? docs.map((d) => `
            <div class="workspace-doc-item">
                <span>${escapeHTML(d.original_filename)}</span>
                <button data-remove="${d.id}" title="Remove from workspace">✕</button>
            </div>
        `).join("")
        : `<div class="empty-hint">No documents in this workspace yet.</div>`;

    el("workspaceDocs").querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            await api(`/api/research/collections/${currentWorkspace.id}/documents/${btn.dataset.remove}`, { method: "DELETE" });
            await openWorkspace(currentWorkspace.id);
            await loadWorkspaces();
        });
    });

    renderSelectedDocs();
    renderMetadataDocSelect();
}

function renderSelectedDocs() {
    const docs = (currentWorkspace && currentWorkspace.documents) || [];
    el("selectedDocsList").innerHTML = docs.length
        ? docs.map((d) => `<div class="selected-doc-item"><span>${escapeHTML(d.original_filename)}</span></div>`).join("")
        : `<div class="empty-hint">Select a workspace to choose documents.</div>`;
}

el("renameWorkspaceBtn").addEventListener("click", async () => {
    if (!currentWorkspace) return;
    const name = prompt("Rename workspace:", currentWorkspace.name);
    if (!name || !name.trim()) return;
    await api(`/api/research/collections/${currentWorkspace.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
    });
    await openWorkspace(currentWorkspace.id);
    await loadWorkspaces();
});

el("deleteWorkspaceBtn").addEventListener("click", async () => {
    if (!currentWorkspace) return;
    if (!confirm(`Delete workspace "${currentWorkspace.name}"? Documents themselves are not deleted.`)) return;
    await api(`/api/research/collections/${currentWorkspace.id}`, { method: "DELETE" });
    currentWorkspace = null;
    renderWorkspaceDetail();
    await loadWorkspaces();
});


// ========================================
// Add documents (picker modal, reused for workspace add)
// ========================================

const pickerModal = el("pickerModal");
const pickerModalBody = el("pickerModalBody");

el("addDocsBtn").addEventListener("click", async () => {
    if (!currentWorkspace) return;

    const { ok, data } = await api("/api/documents");
    const ready = ok ? data.documents.filter((d) => d.status === "ready") : [];
    const already = new Set((currentWorkspace.documents || []).map((d) => d.id));
    const available = ready.filter((d) => !already.has(d.id));

    el("pickerModalTitle").innerText = "Add documents to workspace";

    if (available.length === 0) {
        pickerModalBody.innerHTML = `<p>No more ready documents to add. <a href="index.html">Upload more</a>.</p>`;
    } else {
        pickerModalBody.innerHTML = `
            ${available.map((d) => `
                <label class="picker-item picker-checkbox-item">
                    <input type="checkbox" value="${d.id}">
                    ${escapeHTML(d.original_filename)}
                </label>
            `).join("")}
            <button id="confirmAddDocsBtn" class="primary-button full-width" style="margin-top:12px;">Add Selected</button>
        `;

        pickerModalBody.querySelector("#confirmAddDocsBtn").addEventListener("click", async () => {
            const ids = [...pickerModalBody.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
            if (ids.length === 0) return;
            await api(`/api/research/collections/${currentWorkspace.id}/documents`, {
                method: "POST",
                body: JSON.stringify({ document_ids: ids }),
            });
            pickerModal.hidden = true;
            await openWorkspace(currentWorkspace.id);
            await loadWorkspaces();
        });
    }

    pickerModal.hidden = false;
});

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => { pickerModal.hidden = true; });
});
pickerModal.addEventListener("click", (e) => { if (e.target === pickerModal) pickerModal.hidden = true; });
if (!window.__paperchatResearchEscapeBound) {
    window.__paperchatResearchEscapeBound = true;
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !pickerModal.hidden) pickerModal.hidden = true;
    });
}


// ========================================
// Tabs
// ========================================

document.querySelectorAll(".research-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".research-tab").forEach((t) => t.classList.toggle("active", t === tab));
        document.querySelectorAll(".research-panel").forEach((p) => {
            p.hidden = p.dataset.panel !== tab.dataset.tab;
        });
    });
});

function requireWorkspace() {
    if (!currentWorkspace) {
        toastWarning("Select or create a workspace first.");
        return false;
    }
    return true;
}


// ========================================
// Search
// ========================================

el("researchSearchBtn").addEventListener("click", runResearchSearch);
el("researchSearchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runResearchSearch(); });

async function runResearchSearch() {
    if (!requireWorkspace()) return;
    const query = el("researchSearchInput").value.trim();
    if (!query) return;

    const resultsEl = el("researchSearchResults");
    resultsEl.innerHTML = `<div class="empty-hint">Searching…</div>`;

    const { ok, data } = await api("/api/research/search", {
        method: "POST",
        body: JSON.stringify({ query, collection_id: currentWorkspace.id }),
    });

    if (!ok || !data.success || data.documents.length === 0) {
        resultsEl.innerHTML = `<div class="empty-hint">No matches found.</div>`;
        return;
    }

    resultsEl.innerHTML = data.documents.map((doc) => `
        <div class="search-result-card">
            <h3>📄 ${escapeHTML(doc.filename)}</h3>
            ${doc.matches.map((m) => `
                <div class="search-match" data-doc="${doc.document_id}" data-page="${m.page_number}">
                    <span class="match-page">Page ${m.page_number}</span>${escapeHTML(m.snippet)} <em>(score ${m.score})</em>
                </div>
            `).join("")}
        </div>
    `).join("");

    resultsEl.querySelectorAll(".search-match").forEach((node) => {
        node.addEventListener("click", () => {
            window.location.href = `chat.html?doc=${node.dataset.doc}&page=${node.dataset.page}`;
        });
    });
}


// ========================================
// Compare
// ========================================

el("runCompareBtn").addEventListener("click", async () => {
    if (!requireWorkspace()) return;
    if ((currentWorkspace.documents || []).length < 2) {
        toastWarning("Add at least 2 documents to this workspace to compare them.");
        return;
    }

    const out = el("compareOutput");
    out.innerHTML = `<div class="empty-hint">Comparing… this reruns retrieval per document/aspect, may take a moment.</div>`;

    const { ok, data } = await api("/api/research/compare", {
        method: "POST",
        body: JSON.stringify({ collection_id: currentWorkspace.id }),
    });

    if (!ok || !data.success) {
        out.innerHTML = `<div class="empty-hint">Comparison failed.</div>`;
        return;
    }

    lastCompareMarkdown = data.comparison_markdown;
    out.innerHTML = renderMarkdown(data.comparison_markdown);
    if (data.low_evidence) {
        out.innerHTML = `<p><em>Not enough evidence was found in the selected documents.</em></p>` + out.innerHTML;
    }
});


// ========================================
// Synthesize
// ========================================

el("runSynthesizeBtn").addEventListener("click", runSynthesize);
el("synthesizeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runSynthesize(); });

async function runSynthesize() {
    if (!requireWorkspace()) return;
    const question = el("synthesizeInput").value.trim();
    if (!question) return;

    const out = el("synthesizeOutput");
    out.innerHTML = `<div class="empty-hint">Synthesizing…</div>`;

    const { ok, data } = await api("/api/research/synthesize", {
        method: "POST",
        body: JSON.stringify({ question, collection_id: currentWorkspace.id }),
    });

    if (!ok || !data.success) {
        out.innerHTML = `<div class="empty-hint">Synthesis failed.</div>`;
        return;
    }

    lastSynthesizeText = data.answer;
    out.innerHTML = renderMarkdown(data.answer);
}


// ========================================
// Research Gaps
// ========================================

el("runGapsBtn").addEventListener("click", async () => {
    if (!requireWorkspace()) return;

    const out = el("gapsOutput");
    out.innerHTML = `<div class="empty-hint">Analyzing…</div>`;

    const { ok, data } = await api("/api/research/gaps", {
        method: "POST",
        body: JSON.stringify({ collection_id: currentWorkspace.id }),
    });

    if (!ok || !data.success) {
        out.innerHTML = `<div class="empty-hint">Gap analysis failed.</div>`;
        return;
    }

    const explicit = data.explicit_gaps || [];
    const inferred = data.inferred_gaps || [];

    lastGapsText = [
        "### Explicitly Stated Gaps",
        ...explicit.map((g) => `- **${g.document || ""}** (Page ${g.page ?? "?"}): ${g.gap}`),
        "",
        "### Inferred Gaps (comparison-based analysis, not directly stated)",
        ...inferred.map((g) => `- ${g.gap} — based on: ${(g.based_on || []).join(", ")} (${g.reasoning || ""})`),
    ].join("\n");

    out.innerHTML = `
        <div class="gap-section explicit">
            <h4>Explicitly Stated by the Papers</h4>
            ${explicit.length ? explicit.map((g) => `
                <div class="gap-card explicit">
                    <span class="gap-tag">Explicit</span>
                    <div>${escapeHTML(g.gap)}</div>
                    <div class="gap-meta">${escapeHTML(g.document || "")}${g.page ? ` · Page ${g.page}` : ""}</div>
                </div>
            `).join("") : `<div class="empty-hint">None found.</div>`}
        </div>
        <div class="gap-section inferred">
            <h4>Inferred by Comparing Documents (analysis, not a stated fact)</h4>
            ${inferred.length ? inferred.map((g) => `
                <div class="gap-card inferred">
                    <span class="gap-tag">Inferred</span>
                    <div>${escapeHTML(g.gap)}</div>
                    <div class="gap-meta">Based on: ${escapeHTML((g.based_on || []).join(", "))} — ${escapeHTML(g.reasoning || "")}</div>
                </div>
            `).join("") : `<div class="empty-hint">None found.</div>`}
        </div>
    `;
});


// ========================================
// Structured Metadata
// ========================================

function renderMetadataDocSelect() {
    const docs = (currentWorkspace && currentWorkspace.documents) || [];
    el("metadataDocSelect").innerHTML = docs.map((d) => `<option value="${d.id}">${escapeHTML(d.original_filename)}</option>`).join("");
}

el("runMetadataBtn").addEventListener("click", async () => {
    const docId = el("metadataDocSelect").value;
    if (!docId) { toastWarning("Select or create a workspace with at least one document first."); return; }

    const out = el("metadataOutput");
    out.innerHTML = `<div class="empty-hint">Extracting…</div>`;

    const { ok, data } = await api(`/api/research/metadata/${docId}`);

    if (!ok || !data.success) {
        out.innerHTML = `<div class="empty-hint">Extraction failed.</div>`;
        return;
    }

    const m = data.metadata;

    if (m.status === "failed") {
        out.innerHTML = `<div class="empty-hint">Extraction failed: ${escapeHTML(m.error || "unknown error")}</div>`;
        return;
    }

    const field = (label, value) => {
        const isList = Array.isArray(value);
        const display = isList ? (value.length ? value.join(", ") : "Not found") : (value || "Not found");
        const notFound = display === "Not found" || display === "Not clearly stated";
        return `<div class="metadata-field"><div class="field-label">${label}</div><div class="field-value ${notFound ? "not-found" : ""}">${escapeHTML(display)}</div></div>`;
    };

    out.innerHTML = `<div class="metadata-grid">
        ${field("Title", m.title)}
        ${field("Authors", m.authors)}
        ${field("Publication Year", m.publication_year)}
        ${field("Keywords", m.keywords)}
        ${field("Objective", m.objective)}
        ${field("Methodology", m.methodology)}
        ${field("Dataset", m.dataset)}
        ${field("Future Work", m.future_work)}
    </div>
    ${field("Abstract", m.abstract)}
    ${field("Key Findings", m.key_findings)}
    ${field("Limitations", m.limitations)}
    `;
});


// ========================================
// Bookmarks
// ========================================

async function loadBookmarks() {
    const { ok, data } = await api("/api/research/bookmarks");
    if (!ok || !data.success) return;

    const list = el("bookmarksList");

    if (data.bookmarks.length === 0) {
        list.innerHTML = `<div class="empty-hint">No saved evidence yet. Save snippets from the Chat page's source cards.</div>`;
        return;
    }

    list.innerHTML = data.bookmarks.map((b) => `
        <div class="bookmark-card" data-id="${b.id}">
            <div class="bookmark-meta">📄 ${escapeHTML(b.filename || b.document_id)}${b.page_number ? ` · Page ${b.page_number}` : ""}</div>
            <div class="bookmark-snippet">"${escapeHTML(b.snippet)}"</div>
            <textarea placeholder="Add a note…">${escapeHTML(b.note || "")}</textarea>
            <div class="bookmark-actions">
                <button class="ghost-button save-note-btn">Save Note</button>
                <button class="ghost-button open-btn">Open PDF</button>
                <button class="ghost-button delete-btn">Delete</button>
            </div>
        </div>
    `).join("");

    list.querySelectorAll(".bookmark-card").forEach((card) => {
        const id = card.dataset.id;
        card.querySelector(".save-note-btn").addEventListener("click", async () => {
            const note = card.querySelector("textarea").value;
            await api(`/api/research/bookmarks/${id}`, { method: "PATCH", body: JSON.stringify({ note }) });
            toastSuccess("Note saved.");
        });
        card.querySelector(".delete-btn").addEventListener("click", async () => {
            if (!confirm("Delete this saved evidence?")) return;
            await api(`/api/research/bookmarks/${id}`, { method: "DELETE" });
            loadBookmarks();
            toastSuccess("Bookmark removed.");
        });
        card.querySelector(".open-btn").addEventListener("click", async () => {
            const { data } = await api("/api/research/bookmarks");
            const b = (data.bookmarks || []).find((x) => x.id === id);
            if (b) window.location.href = `chat.html?doc=${b.document_id}&page=${b.page_number || 1}`;
        });
    });
}

document.querySelector('[data-tab="bookmarks"]').addEventListener("click", loadBookmarks);


// ========================================
// Export
// ========================================

el("runExportBtn").addEventListener("click", async () => {

    const sections = [];
    if (lastCompareMarkdown) sections.push({ title: "Comparison", content: lastCompareMarkdown });
    if (lastSynthesizeText) sections.push({ title: "Synthesis", content: lastSynthesizeText });
    if (lastGapsText) sections.push({ title: "Research Gaps", content: lastGapsText });

    try {
        const response = await authedFetch(`${API_URL}/api/research/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                collection_id: currentWorkspace ? currentWorkspace.id : null,
                include_bookmarks: el("exportIncludeBookmarks").checked,
                sections,
            }),
        });

        if (!response.ok) { toastError("Export failed."); return; }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "paperchat-research-export.md";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toastSuccess("Export downloaded.");
    } catch (error) {
        console.error("EXPORT ERROR:", error);
        toastError("Could not connect to the backend.");
    }
});


// ========================================
// Init
// ========================================

loadWorkspaces();
