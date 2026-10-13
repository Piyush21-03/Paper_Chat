const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ========================================
// State
// ========================================

let conversations = [];
let currentConversation = null; // full detail object (with messages)
let documentsCache = {}; // id -> document object

let pdfDoc = null;
let currentDocId = null;
let currentPageNum = 1;
let currentZoom = 1.2;

// ========================================
// Elements
// ========================================

const el = (id) => document.getElementById(id);

const sidebarToggle = el("sidebarToggle");
const convSidebar = el("convSidebar");
const convList = el("convList");
const newChatBtn = el("newChatBtn");
const workspaceTitle = el("workspaceTitle");

const docSwitcher = el("docSwitcher");
const prevPageBtn = el("prevPage");
const nextPageBtn = el("nextPage");
const pageIndicator = el("pageIndicator");
const zoomOutBtn = el("zoomOut");
const zoomInBtn = el("zoomIn");
const zoomLevel = el("zoomLevel");
const summaryBtn = el("summaryBtn");
const tablesBtn = el("tablesBtn");

const viewerEmpty = el("viewerEmpty");
const viewerLoading = el("viewerLoading");
const viewerError = el("viewerError");
const pdfCanvas = el("pdfCanvas");

const chatMessages = el("chatMessages");
const chatEmpty = el("chatEmpty");
const chatForm = el("chatForm");
const questionInput = el("question");
const askButton = el("askButton");
const stopButton = el("stopButton");
const clearConversationBtn = el("clearConversationBtn");

const summaryModal = el("summaryModal");
const summaryModalBody = el("summaryModalBody");
const tablesModal = el("tablesModal");
const tablesModalBody = el("tablesModalBody");
const pickerModal = el("pickerModal");
const pickerModalBody = el("pickerModalBody");

marked.setOptions({ breaks: true });


// ========================================
// API helpers
// ========================================

async function api(path, options = {}) {
    const response = await authedFetch(`${API_URL}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

async function getDocument(id) {
    if (documentsCache[id]) return documentsCache[id];
    const { ok, data } = await api(`/api/documents/${id}`);
    if (ok && data.success) {
        documentsCache[id] = data.document;
        return data.document;
    }
    return null;
}


// ========================================
// Sidebar: conversation list
// ========================================

async function loadConversations() {
    const { ok, data } = await api("/api/conversations");
    if (ok && data.success) {
        conversations = data.conversations;
        renderConvList();
    }
}

function renderConvList() {
    convList.innerHTML = conversations.map((c) => `
        <div class="conv-item ${currentConversation && c.id === currentConversation.id ? "active" : ""}" data-id="${c.id}">
            <span class="conv-title">${escapeHTML(c.title)}</span>
            <span class="conv-item-actions">
                <button data-action="rename" title="Rename">✎</button>
                <button data-action="delete" title="Delete">🗑</button>
            </span>
        </div>
    `).join("");

    convList.querySelectorAll(".conv-item").forEach((node) => {
        const id = node.dataset.id;

        node.addEventListener("click", (e) => {
            if (e.target.closest("[data-action]")) return;
            openConversation(id);
        });

        node.querySelector('[data-action="rename"]').addEventListener("click", async (e) => {
            e.stopPropagation();
            const conv = conversations.find((c) => c.id === id);
            const title = prompt("Rename chat:", conv.title);
            if (!title || !title.trim()) return;
            await api(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title: title.trim() }) });
            await loadConversations();
            if (currentConversation && currentConversation.id === id) currentConversation.title = title.trim();
            updateTitle();
        });

        node.querySelector('[data-action="delete"]').addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!confirm("Delete this conversation?")) return;
            await api(`/api/conversations/${id}`, { method: "DELETE" });
            if (currentConversation && currentConversation.id === id) {
                currentConversation = null;
                history.replaceState(null, "", "chat.html");
                renderMessages();
                updateTitle();
                clearConversationBtn.hidden = true;
                questionInput.disabled = true;
                askButton.disabled = true;
            }
            await loadConversations();
            toastSuccess("Conversation deleted.");
        });
    });
}


// ========================================
// New chat (document picker)
// ========================================

newChatBtn.addEventListener("click", async () => {

    const { ok, data } = await api("/api/documents");
    const ready = ok ? data.documents.filter((d) => d.status === "ready") : [];

    if (ready.length === 0) {
        pickerModalBody.innerHTML = `<p>No processed documents yet. Upload one from the <a href="index.html">documents page</a> first.</p>`;
    } else {
        pickerModalBody.innerHTML = `
            <p style="color:var(--muted); font-size:12px; margin-bottom:10px;">Select one or more documents for this conversation.</p>
            ${ready.map((d) => `
                <label class="picker-item picker-checkbox-item">
                    <input type="checkbox" value="${d.id}" ${d.id === currentDocId ? "checked" : ""}>
                    ${escapeHTML(d.original_filename)}
                </label>
            `).join("")}
            <button id="startChatBtn" class="primary-button full-width" style="margin-top:12px;">Start Chat</button>
        `;

        pickerModalBody.querySelector("#startChatBtn").addEventListener("click", async () => {
            const ids = [...pickerModalBody.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
            if (ids.length === 0) return;
            closeModals();
            await createConversation(ids);
        });
    }

    openModal(pickerModal);
});

async function createConversation(documentIds) {
    const { ok, data } = await api("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ document_ids: documentIds }),
    });
    if (ok && data.success) {
        await loadConversations();
        await openConversation(data.conversation.id);
    }
}


// ========================================
// Open a conversation
// ========================================

async function openConversation(id) {

    const { ok, data } = await api(`/api/conversations/${id}`);

    if (!ok || !data.success) {
        addSystemNotice("Could not load that conversation.");
        return;
    }

    currentConversation = data.conversation;
    history.replaceState(null, "", `chat.html?conversation=${id}`);

    renderConvList();
    renderMessages();
    updateTitle();
    await setupDocSwitcher();

    const canAsk = currentConversation.document_ids.length > 0;
    questionInput.disabled = !canAsk;
    askButton.disabled = !canAsk;
    clearConversationBtn.hidden = false;

    closeSidebarOnMobile();
}

function updateTitle() {
    workspaceTitle.innerText = currentConversation ? currentConversation.title : "PaperChat";
}

clearConversationBtn.addEventListener("click", async () => {
    if (!currentConversation) return;
    if (!confirm("Clear this conversation? This deletes its message history and cannot be undone.")) return;

    const scopedDocIds = currentConversation.document_ids;
    await api(`/api/conversations/${currentConversation.id}`, { method: "DELETE" });
    toastSuccess("Conversation cleared.");
    await loadConversations();
    await createConversation(scopedDocIds);
});


// ========================================
// Document switcher + PDF viewer
// ========================================

async function setupDocSwitcher() {

    const ids = (currentConversation && currentConversation.document_ids) || [];

    if (ids.length === 0) {
        docSwitcher.innerHTML = "";
        showViewerEmpty();
        return;
    }

    const docs = await Promise.all(ids.map(getDocument));

    docSwitcher.innerHTML = docs.filter(Boolean).map((d) =>
        `<option value="${d.id}">${escapeHTML(d.original_filename)}</option>`
    ).join("");

    docSwitcher.onchange = () => loadPdf(docSwitcher.value, 1);

    if (docs[0]) await loadPdf(docs[0].id, 1);
}

function showViewerEmpty() {
    viewerEmpty.hidden = false;
    viewerLoading.hidden = true;
    viewerError.hidden = true;
    pdfCanvas.hidden = true;
}

function showViewerLoading() {
    viewerEmpty.hidden = true;
    viewerLoading.hidden = false;
    viewerError.hidden = true;
    pdfCanvas.hidden = true;
}

function showViewerError() {
    viewerEmpty.hidden = true;
    viewerLoading.hidden = true;
    viewerError.hidden = false;
    pdfCanvas.hidden = true;
}

async function loadPdf(docId, pageNum) {

    showViewerLoading();

    try {

        const loadingTask = pdfjsLib.getDocument({
            url: `${API_URL}/api/documents/${docId}/file`,
            httpHeaders: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        });
        pdfDoc = await loadingTask.promise;
        currentDocId = docId;
        docSwitcher.value = docId;

        viewerEmpty.hidden = true;
        viewerLoading.hidden = true;
        viewerError.hidden = true;
        pdfCanvas.hidden = false;

        await renderPage(Math.min(pageNum || 1, pdfDoc.numPages));

    } catch (error) {
        console.error("PDF LOAD ERROR:", error);
        showViewerError();
    }
}

async function renderPage(num) {

    if (!pdfDoc) return;

    currentPageNum = Math.max(1, Math.min(num, pdfDoc.numPages));

    const page = await pdfDoc.getPage(currentPageNum);
    const viewport = page.getViewport({ scale: currentZoom });

    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    await page.render({ canvasContext: pdfCanvas.getContext("2d"), viewport }).promise;

    pageIndicator.innerText = `${currentPageNum} / ${pdfDoc.numPages}`;
    zoomLevel.innerText = `${Math.round(currentZoom / 1.2 * 100)}%`;
}

async function goToCitation(docId, pageNum) {

    switchToTab("viewer");

    if (docId && docId !== currentDocId) {
        await loadPdf(docId, pageNum);
    } else {
        await renderPage(pageNum);
    }

    flashViewerHighlight();
}

function flashViewerHighlight() {
    const wrap = document.querySelector(".viewer-canvas-wrap");
    wrap.classList.add("citation-flash");
    setTimeout(() => wrap.classList.remove("citation-flash"), 900);
}

prevPageBtn.addEventListener("click", () => renderPage(currentPageNum - 1));
nextPageBtn.addEventListener("click", () => renderPage(currentPageNum + 1));
zoomInBtn.addEventListener("click", () => { currentZoom = Math.min(currentZoom + 0.2, 3.6); renderPage(currentPageNum); });
zoomOutBtn.addEventListener("click", () => { currentZoom = Math.max(currentZoom - 0.2, 0.6); renderPage(currentPageNum); });


// ========================================
// Chat messages rendering
// ========================================

function renderMessages() {

    chatMessages.innerHTML = "";

    const messages = (currentConversation && currentConversation.messages) || [];

    if (messages.length === 0) {
        chatMessages.appendChild(chatEmpty);
        chatEmpty.hidden = false;
        return;
    }

    chatEmpty.hidden = true;

    messages.forEach((m) => appendMessage(m.role, m.content, m.sources, m.mode, null));

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessage(role, content, sources, mode, calculation, lowEvidence, followUpQuestions) {

    chatEmpty.hidden = true;

    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    if (role === "user") {
        bubble.textContent = content;
    } else {
        bubble.innerHTML = renderAssistantHTML(content, sources);
        if (lowEvidence) bubble.classList.add("low-evidence");
    }

    wrap.appendChild(bubble);

    if (role === "assistant" && sources && sources.length) {
        wrap.appendChild(renderSourcesPanel(sources));
    }

    if (role === "assistant" && calculation) {
        const box = document.createElement("div");
        box.className = "calc-box";
        box.innerText = `🧮 ${calculation.operation}: ${calculation.explanation}`;
        wrap.appendChild(box);
    }

    if (role === "assistant" && followUpQuestions && followUpQuestions.length) {
        wrap.appendChild(renderFollowUpChips(followUpQuestions));
    }

    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return wrap;
}

function renderFollowUpChips(questions) {

    const wrap = document.createElement("div");
    wrap.className = "followup-chips";

    questions.forEach((q) => {
        const chip = document.createElement("button");
        chip.className = "followup-chip";
        chip.innerText = q;
        chip.addEventListener("click", () => {
            questionInput.value = q;
            sendQuestion();
        });
        wrap.appendChild(chip);
    });

    return wrap;
}

function renderAssistantHTML(content, sources) {

    const distinctDocs = new Set((sources || []).map((s) => s.document_id).filter(Boolean));
    const soleDocId = distinctDocs.size === 1 ? [...distinctDocs][0] : null;

    // Turn "[Page N]" into a clickable chip only when the message is
    // scoped to a single, unambiguous document. Structured source IDs
    // (below, in the Sources panel) are the unambiguous mechanism for
    // multi-document answers -- inline [Page N] is a same-document
    // shorthand only.
    let withCitations = content.replace(/\[Page\s+(\d+)\]/gi, (match, page) => {
        if (!soleDocId) return match;
        return `<button class="citation-chip" data-doc="${soleDocId}" data-page="${page}">📄 Page ${page}</button>`;
    });

    const html = marked.parse(withCitations);
    return DOMPurify.sanitize(html, { ADD_ATTR: ["data-doc", "data-page"] });
}

function renderSourcesPanel(sources) {

    const wrap = document.createElement("div");
    wrap.className = "sources-panel";

    const seen = new Set();
    const deduped = [];
    sources.forEach((s) => {
        const key = `${s.document_id}-${s.page_number}`;
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(s);
    });

    const toggle = document.createElement("button");
    toggle.className = "sources-toggle";
    toggle.innerText = `Sources (${deduped.length}) ▾`;

    const list = document.createElement("div");
    list.className = "sources-list";
    list.hidden = true;

    list.innerHTML = deduped.map((s, i) => `
        <div class="source-card" data-idx="${i}" tabindex="0" role="button" aria-label="Open ${escapeHTML(s.filename || s.document_id)}, page ${s.page_number}">
            <div class="source-card-title">📄 ${escapeHTML(s.filename || s.document_id)}</div>
            <div class="source-card-meta">
                Page ${s.page_number}
                ${s.relevance_score != null ? ` · Relevance ${s.relevance_score.toFixed(2)}` : ""}
            </div>
            <div class="source-card-snippet">"${escapeHTML(s.snippet)}"</div>
            <div class="source-card-actions">
                <button class="bookmark-source-btn" data-idx="${i}" title="Save this evidence">🔖 Save</button>
                <button class="copy-citation-btn" data-idx="${i}" title="Copy citation">📎 Copy citation</button>
            </div>
        </div>
    `).join("");

    list.querySelectorAll(".source-card").forEach((card, i) => {
        card.addEventListener("click", () => goToCitation(deduped[i].document_id, deduped[i].page_number));
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                goToCitation(deduped[i].document_id, deduped[i].page_number);
            }
        });
    });

    list.querySelectorAll(".copy-citation-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const s = deduped[parseInt(btn.dataset.idx, 10)];
            const citationText = `${s.filename || s.document_id}, Page ${s.page_number}: "${s.snippet}"`;
            try {
                await navigator.clipboard.writeText(citationText);
                toastSuccess("Citation copied.");
            } catch (err) {
                toastError("Could not copy citation.");
            }
        });
    });


    list.querySelectorAll(".bookmark-source-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const s = deduped[parseInt(btn.dataset.idx, 10)];
            btn.disabled = true;
            btn.innerText = "Saving…";
            try {
                const response = await authedFetch(`${API_URL}/api/research/bookmarks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        document_id: s.document_id,
                        page_number: s.page_number,
                        chunk_index: s.chunk_index ?? null,
                        snippet: s.snippet,
                    }),
                });
                btn.innerText = response.ok ? "✓ Saved" : "Failed";
                if (response.ok) toastSuccess("Evidence saved to bookmarks.");
                else toastError("Could not save this evidence.");
            } catch (error) {
                btn.innerText = "Failed";
            }
        });
    });

    toggle.addEventListener("click", () => {
        list.hidden = !list.hidden;
        toggle.innerText = `Sources (${deduped.length}) ${list.hidden ? "▾" : "▴"}`;
    });

    wrap.appendChild(toggle);
    wrap.appendChild(list);

    return wrap;
}

// Event delegation for inline [Page N] citation chips.
chatMessages.addEventListener("click", (e) => {
    const chip = e.target.closest(".citation-chip");
    if (!chip) return;
    goToCitation(chip.dataset.doc, parseInt(chip.dataset.page, 10));
});


// ========================================
// Sending a question
// ========================================

let activeStreamController = null;

chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendQuestion();
});

stopButton.addEventListener("click", () => {
    if (activeStreamController) activeStreamController.abort();
});

function setStreamingUI(isStreaming) {
    askButton.hidden = isStreaming;
    stopButton.hidden = !isStreaming;
    questionInput.disabled = isStreaming;
}

async function sendQuestion(overrideQuestion) {

    const question = overrideQuestion || questionInput.value.trim();
    if (!question || !currentConversation || activeStreamController) return;

    if (!overrideQuestion) questionInput.value = "";

    appendMessage("user", question, null, null, null);
    currentConversation.messages.push({ role: "user", content: question });

    const assistantWrap = appendMessage("assistant", "", null, null, null);
    const bubble = assistantWrap.querySelector(".msg-bubble");
    bubble.classList.add("loading");
    bubble.innerText = "Thinking…";

    setStreamingUI(true);

    let accumulated = "";
    let finalSources = [];

    const controller = new AbortController();
    activeStreamController = controller;

    try {

        const response = await authedFetch(`${API_URL}/ask/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, conversation_id: currentConversation.id }),
            signal: controller.signal,
        });

        if (!response.ok || !response.body) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Request failed (${response.status})`);
        }

        bubble.classList.remove("loading");
        bubble.innerText = "";

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {

            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let idx;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {

                const rawEvent = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);

                if (!rawEvent.startsWith("data: ")) continue;

                let payload;
                try { payload = JSON.parse(rawEvent.slice(6)); } catch (e) { continue; }

                if (payload.type === "chunk") {

                    accumulated += payload.text;
                    bubble.innerHTML = renderAssistantHTML(accumulated, finalSources);

                } else if (payload.type === "sources") {

                    finalSources = payload.sources || [];

                } else if (payload.type === "error") {

                    throw new Error(payload.message || "Something went wrong.");

                } else if (payload.type === "done") {

                    accumulated = payload.answer;
                    finalSources = payload.sources || [];

                    bubble.innerHTML = renderAssistantHTML(accumulated, finalSources);
                    if (payload.low_evidence) bubble.classList.add("low-evidence");

                    if (finalSources.length) assistantWrap.appendChild(renderSourcesPanel(finalSources));

                    if (payload.calculation) {
                        const box = document.createElement("div");
                        box.className = "calc-box";
                        box.innerText = `🧮 ${payload.calculation.operation}: ${payload.calculation.explanation}`;
                        assistantWrap.appendChild(box);
                    }

                    if (payload.follow_up_questions && payload.follow_up_questions.length) {
                        assistantWrap.appendChild(renderFollowUpChips(payload.follow_up_questions));
                    }

                    addMessageControls(assistantWrap, accumulated, question);

                    currentConversation.messages.push({
                        role: "assistant", content: accumulated, sources: finalSources, mode: payload.mode,
                    });
                }
            }
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {

        if (error.name === "AbortError") {

            bubble.classList.remove("loading");
            if (!accumulated) {
                bubble.innerText = "Generation stopped.";
            } else {
                bubble.innerHTML = renderAssistantHTML(accumulated, finalSources);
                addMessageControls(assistantWrap, accumulated, question);
            }

        } else {

            console.error("ASK STREAM ERROR:", error);
            bubble.classList.remove("loading");
            bubble.classList.add("error");
            bubble.innerText = `❌ ${error.message || "Could not connect to the backend."}`;
            addRetryButton(assistantWrap, question);
            toastError("Could not get a response. You can retry from the message.");
        }

    } finally {

        activeStreamController = null;
        setStreamingUI(false);
        questionInput.focus();
    }
}

function addRetryButton(wrap, question) {
    const btn = document.createElement("button");
    btn.className = "msg-action-btn retry-btn-inline";
    btn.innerText = "↻ Retry";
    btn.addEventListener("click", () => {
        wrap.remove();
        sendQuestion(question);
    });
    wrap.appendChild(btn);
}

function addMessageControls(wrap, answerText, question) {

    const controls = document.createElement("div");
    controls.className = "msg-controls";

    const copyBtn = document.createElement("button");
    copyBtn.className = "msg-action-btn";
    copyBtn.innerText = "📋 Copy";
    copyBtn.setAttribute("aria-label", "Copy answer");
    copyBtn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(answerText);
            copyBtn.innerText = "✓ Copied";
            toastSuccess("Answer copied to clipboard.");
            setTimeout(() => { copyBtn.innerText = "📋 Copy"; }, 1500);
        } catch (e) {
            toastError("Could not copy to clipboard.");
        }
    });
    controls.appendChild(copyBtn);

    const regenBtn = document.createElement("button");
    regenBtn.className = "msg-action-btn";
    regenBtn.innerText = "🔁 Regenerate";
    regenBtn.setAttribute("aria-label", "Regenerate answer");
    regenBtn.addEventListener("click", () => {
        // Drop the stale turn from local history (server-side history
        // for the *next* request is re-derived from the DB, which will
        // include this old turn -- acceptable: regenerate is "ask again",
        // not "erase and rewrite", matching /ask's existing semantics).
        wrap.remove();
        sendQuestion(question);
    });
    controls.appendChild(regenBtn);

    wrap.appendChild(controls);
}

function addSystemNotice(text) {
    appendMessage("assistant", text, null, null, null);
}


// ========================================
// Summary modal
// ========================================

summaryBtn.addEventListener("click", async () => {

    if (!currentDocId) return;

    const doc = await getDocument(currentDocId);
    if (!doc) return;

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

    openModal(summaryModal);
});


// ========================================
// Tables modal
// ========================================

tablesBtn.addEventListener("click", async () => {

    if (!currentDocId) return;

    const { ok, data } = await api(`/api/documents/${currentDocId}/tables`);

    if (!ok || !data.success || data.tables.length === 0) {
        tablesModalBody.innerHTML = `<p>No tables detected in this document.</p>`;
    } else {
        tablesModalBody.innerHTML = data.tables.map((t) => `
            <div class="table-card">
                <div class="table-card-header">
                    <span>Page ${t.page_number} · ${t.row_count}×${t.col_count}</span>
                    <span class="table-card-links">
                        <button class="link-btn" data-url="${API_URL}/api/documents/${currentDocId}/tables/${t.id}/csv" data-filename="table_page${t.page_number}.csv">CSV</button>
                        ${t.has_xlsx ? `<button class="link-btn" data-url="${API_URL}/api/documents/${currentDocId}/tables/${t.id}/xlsx" data-filename="table_page${t.page_number}.xlsx">XLSX</button>` : ""}
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

    openModal(tablesModal);
});


// ========================================
// Modal helpers
// ========================================

function openModal(modal) { modal.hidden = false; }
function closeModals() {
    [summaryModal, tablesModal, pickerModal].forEach((m) => m.hidden = true);
}

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", closeModals);
});

// Escape closes whichever of summaryModal/tablesModal/pickerModal is open.
// Guarded against double-binding if this script is ever included twice.
if (!window.__paperchatChatEscapeBound) {
    window.__paperchatChatEscapeBound = true;
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        closeModals();
    });
}

[summaryModal, tablesModal, pickerModal].forEach((modal) => {
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModals(); });
});


// ========================================
// Sidebar toggle (mobile) + mobile tabs
// ========================================

sidebarToggle.addEventListener("click", () => convSidebar.classList.toggle("open"));

function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) convSidebar.classList.remove("open");
}

const viewerPanel = document.querySelector('.viewer-panel[data-panel="viewer"]');
const chatPanel = document.querySelector('.chat-panel[data-panel="chat"]');

function switchToTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "viewer") {
        viewerPanel.removeAttribute("data-hidden");
        chatPanel.setAttribute("data-hidden", "");
    } else {
        chatPanel.removeAttribute("data-hidden");
        viewerPanel.setAttribute("data-hidden", "");
    }
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchToTab(btn.dataset.tab));
});


// ========================================
// Helpers
// ========================================

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : text;
    return div.innerHTML;
}


// ========================================
// Init
// ========================================

async function init() {

    await loadConversations();

    const params = new URLSearchParams(window.location.search);
    const conversationParam = params.get("conversation");
    const docParam = params.get("doc");
    const pageParam = params.get("page");

    if (conversationParam) {
        await openConversation(conversationParam);
    } else if (docParam) {
        await createConversation([docParam]);
        if (pageParam) await goToCitation(docParam, parseInt(pageParam, 10));
    } else {
        showViewerEmpty();
        updateTitle();
    }

    if (window.innerWidth <= 900) switchToTab("viewer");
}

init();
