const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

let runs = [];
let currentDetail = null;

const el = (id) => document.getElementById(id);

const evalSubtitle = el("evalSubtitle");
const runEvalBtn = el("runEvalBtn");
const metricCards = el("metricCards");
const trendChart = el("trendChart");
const runsTableBody = el("runsTableBody");
const resultsSection = el("resultsSection");
const resultsTitle = el("resultsTitle");
const resultsTableBody = el("resultsTableBody");
const compareA = el("compareA");
const compareB = el("compareB");
const compareBtn = el("compareBtn");
const compareResult = el("compareResult");
const detailModal = el("detailModal");
const detailModalBody = el("detailModalBody");


async function api(path, options = {}) {
    const response = await authedFetch(`${API_URL}${path}`, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
}

function pct(v) { return v == null ? "—" : `${v}%`; }
function ms(v) { return v == null ? "—" : (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`); }


// ========================================
// Load + render
// ========================================

async function loadRuns() {

    const { ok, data } = await api("/api/eval/runs");
    if (!ok || !data.success) return;

    runs = data.runs;
    renderMetricCards();
    renderTrend();
    renderRunsTable();
    renderCompareOptions();
}

function renderMetricCards() {

    if (runs.length === 0) {
        evalSubtitle.innerText = "No evaluation runs yet.";
        metricCards.innerHTML = "";
        return;
    }

    const latest = runs[0];
    evalSubtitle.innerText = `${runs.length} run${runs.length === 1 ? "" : "s"} · last run ${new Date(latest.created_at).toLocaleString()} · ${latest.num_questions} questions`;

    const m = latest.metrics;

    const cards = [
        { label: "Retrieval Precision", value: pct(m.retrieval_precision), note: "exact" },
        { label: "Retrieval Recall", value: pct(m.retrieval_recall), note: "exact, where ground truth exists" },
        { label: "Answer Relevance", value: pct(m.answer_relevance), note: "LLM judge score" },
        { label: "Grounding / Faithfulness", value: pct(m.faithfulness), note: "LLM judge score" },
        { label: "Avg Total Latency", value: ms(m.total_latency_ms), note: "retrieval + generation" },
    ];

    metricCards.innerHTML = cards.map((c) => `
        <div class="metric-card">
            <div class="metric-label">${c.label}</div>
            <div class="metric-value">${c.value}</div>
            <div class="metric-note">${c.note}</div>
        </div>
    `).join("");
}

function renderTrend() {

    if (runs.length < 2) {
        trendChart.innerHTML = `<div class="trend-empty">Run at least 2 evaluations to see a trend.</div>`;
        return;
    }

    const ordered = [...runs].reverse(); // oldest -> newest
    const series = [
        { key: "answer_relevance", color: "#52c778", label: "Relevance" },
        { key: "faithfulness", color: "#6fb3e0", label: "Faithfulness" },
    ];

    const w = 640, h = 160, pad = 24;
    const xStep = (w - pad * 2) / (ordered.length - 1 || 1);

    const toY = (v) => h - pad - ((v ?? 0) / 100) * (h - pad * 2);

    const lines = series.map((s) => {
        const points = ordered.map((r, i) => `${pad + i * xStep},${toY(r.metrics[s.key])}`).join(" ");
        return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" />`;
    }).join("");

    const legend = series.map((s) =>
        `<span style="color:${s.color}; margin-right:14px;">● ${s.label}</span>`
    ).join("");

    trendChart.innerHTML = `
        <div style="margin-bottom:8px; font-size:12px;">${legend}</div>
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px;">${lines}</svg>
    `;
}

function renderRunsTable() {

    runsTableBody.innerHTML = runs.map((r, i) => `
        <tr data-id="${r.id}">
            <td>#${runs.length - i} — ${new Date(r.created_at).toLocaleString()}</td>
            <td>${r.num_questions}</td>
            <td>${pct(r.metrics.retrieval_precision)}</td>
            <td>${pct(r.metrics.retrieval_recall)}</td>
            <td>${pct(r.metrics.answer_relevance)}</td>
            <td>${pct(r.metrics.faithfulness)}</td>
            <td>${ms(r.metrics.total_latency_ms)}</td>
        </tr>
    `).join("");

    runsTableBody.querySelectorAll("tr").forEach((row) => {
        row.addEventListener("click", () => openRunDetail(row.dataset.id));
    });
}

function renderCompareOptions() {

    const options = runs.map((r, i) =>
        `<option value="${r.id}">#${runs.length - i} — ${new Date(r.created_at).toLocaleDateString()}</option>`
    ).join("");

    compareA.innerHTML = options;
    compareB.innerHTML = options;

    if (runs.length >= 2) {
        compareA.selectedIndex = 1;
        compareB.selectedIndex = 0;
    }
}


// ========================================
// Run evaluation
// ========================================

runEvalBtn.addEventListener("click", async () => {

    runEvalBtn.disabled = true;
    runEvalBtn.innerText = "Running…";

    try {
        const { ok, data } = await api("/api/eval/run", { method: "POST" });
        if (ok && data.success) {
            await loadRuns();
            toastSuccess("Evaluation run complete.");
        } else {
            toastError(data.message || "Evaluation run failed.");
        }
    } catch (error) {
        console.error("EVAL RUN ERROR:", error);
        toastError("Could not connect to the backend.");
    } finally {
        runEvalBtn.disabled = false;
        runEvalBtn.innerText = "▶ Run Evaluation";
    }
});


// ========================================
// Run detail (per-question results)
// ========================================

async function openRunDetail(runId) {

    const { ok, data } = await api(`/api/eval/runs/${runId}`);
    if (!ok || !data.success) return;

    currentDetail = data.run;
    resultsSection.hidden = false;
    resultsTitle.innerText = `Run Detail — ${new Date(currentDetail.created_at).toLocaleString()}`;

    resultsTableBody.innerHTML = currentDetail.results.map((res) => `
        <tr data-id="${res.id}">
            <td><span class="status-pill ${res.passed || "na"}">${res.passed || "n/a"}</span></td>
            <td>${escapeHTML(res.question)}</td>
            <td>${pct(res.answer_relevance)}</td>
            <td>${pct(res.faithfulness)}</td>
            <td>${ms(res.total_latency_ms)}</td>
        </tr>
    `).join("");

    resultsTableBody.querySelectorAll("tr").forEach((row) => {
        row.addEventListener("click", () => openQuestionDetail(row.dataset.id));
    });

    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openQuestionDetail(resultId) {

    const res = currentDetail.results.find((r) => r.id === resultId);
    if (!res) return;

    const sources = (res.retrieved_sources || []).map((s) =>
        `<span class="source-tag">📄 ${s.filename || s.document_id} · Page ${s.page_number} · score ${s.relevance_score ?? "—"}</span>`
    ).join("");

    detailModalBody.innerHTML = `
        <div class="detail-block"><h4>Question</h4><p>${escapeHTML(res.question)}</p></div>
        <div class="detail-block"><h4>Expected / Reference Answer</h4><p>${escapeHTML(res.expected_answer || "(none provided)")}</p></div>
        <div class="detail-block"><h4>Generated Answer</h4><p>${escapeHTML(res.generated_answer)}</p></div>
        <div class="detail-block"><h4>Retrieved Sources</h4><div>${sources || "(none)"}</div></div>
        <div class="detail-block"><h4>Metric Scores</h4><p>
            Retrieval precision: ${pct(res.retrieval_precision)} (exact)&#10;
            Retrieval recall: ${pct(res.retrieval_recall)} (exact, where ground truth exists)&#10;
            Answer relevance: ${pct(res.answer_relevance)} (LLM judge score)&#10;
            Faithfulness: ${pct(res.faithfulness)} (LLM judge score)
        </p></div>
        <div class="detail-block"><h4>Judge Reasoning</h4><p>${escapeHTML(res.judge_reasoning || "—")}</p></div>
        <div class="detail-block"><h4>Latency</h4><p>Retrieval: ${ms(res.retrieval_latency_ms)}  ·  Generation: ${ms(res.generation_latency_ms)}  ·  Total: ${ms(res.total_latency_ms)}</p></div>
    `;

    detailModal.hidden = false;
}

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => { detailModal.hidden = true; datasetModal.hidden = true; });
});
detailModal.addEventListener("click", (e) => { if (e.target === detailModal) detailModal.hidden = true; });

// Escape closes whichever of detailModal/datasetModal is open. Guarded
// against double-binding if this script is ever included twice.
if (!window.__paperchatEvalEscapeBound) {
    window.__paperchatEvalEscapeBound = true;
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (detailModal && !detailModal.hidden) detailModal.hidden = true;
        if (datasetModal && !datasetModal.hidden) datasetModal.hidden = true;
    });
}


// ========================================
// Compare
// ========================================

compareBtn.addEventListener("click", async () => {

    const a = compareA.value, b = compareB.value;
    if (!a || !b) return;

    const { ok, data } = await api(`/api/eval/compare?run_a=${a}&run_b=${b}`);
    if (!ok || !data.success) return;

    const rows = [
        { label: "Retrieval Precision", key: "retrieval_precision", fmt: pct },
        { label: "Retrieval Recall", key: "retrieval_recall", fmt: pct },
        { label: "Answer Relevance", key: "answer_relevance", fmt: pct },
        { label: "Faithfulness", key: "faithfulness", fmt: pct },
        { label: "Total Latency", key: "total_latency_ms", fmt: ms },
    ];

    compareResult.hidden = false;
    compareResult.innerHTML = rows.map((r) => {
        const d = data.diff[r.key];
        const deltaClass = d.delta == null ? "delta-flat" : d.delta > 0 ? "delta-up" : d.delta < 0 ? "delta-down" : "delta-flat";
        const deltaText = d.delta == null ? "" : ` (${d.delta > 0 ? "+" : ""}${d.delta}${r.key.includes("latency") ? "ms" : "%"})`;
        return `<div><strong>${r.label}</strong><br>${r.fmt(d.from)} → ${r.fmt(d.to)} <span class="${deltaClass}">${deltaText}</span></div>`;
    }).join("");
});


// ========================================
// Helpers
// ========================================

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : text;
    return div.innerHTML;
}


loadRuns();


// ========================================
// Dataset management (Phase 4)
// ========================================

const manageDatasetBtn = el("manageDatasetBtn");
const datasetModal = el("datasetModal");
const newCaseForm = el("newCaseForm");
const caseList = el("caseList");

manageDatasetBtn.addEventListener("click", async () => {
    datasetModal.hidden = false;
    await loadCases();
});

async function loadCases() {
    const { ok, data } = await api("/api/eval/cases");
    if (!ok || !data.success) return;

    caseList.innerHTML = data.cases.map((c) => `
        <div class="case-item" data-id="${c.id}">
            <div>
                <div class="case-question">${escapeHTML(c.question)}</div>
                <div class="case-meta">
                    doc: ${escapeHTML(c.document_id || "any")}
                    ${c.expected_answer ? ` · reference: "${escapeHTML(c.expected_answer)}"` : " · no reference answer"}
                </div>
            </div>
            <button data-action="delete">Delete</button>
        </div>
    `).join("") || `<p style="color:var(--muted); font-size:13px;">No questions yet.</p>`;

    caseList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const id = e.target.closest(".case-item").dataset.id;
            await api(`/api/eval/cases/${id}`, { method: "DELETE" });
            loadCases();
        });
    });
}

newCaseForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const question = el("newCaseQuestion").value.trim();
    const document_id = el("newCaseDocId").value.trim() || null;
    const expected_answer = el("newCaseAnswer").value.trim() || null;

    if (!question) return;

    // Reference answers are only ever what the user types here -- never
    // auto-generated or inferred.
    await api("/api/eval/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, document_id, expected_answer }),
    });

    newCaseForm.reset();
    loadCases();
});

datasetModal.addEventListener("click", (e) => { if (e.target === datasetModal) datasetModal.hidden = true; });
