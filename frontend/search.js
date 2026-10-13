const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

const searchQuery = document.getElementById("searchQuery");
const searchEmpty = document.getElementById("searchEmpty");
const searchResults = document.getElementById("searchResults");
const filterMode = document.getElementById("filterMode");
const filterSort = document.getElementById("filterSort");
const filterPage = document.getElementById("filterPage");
const filterMinRelevance = document.getElementById("filterMinRelevance");
const minRelevanceValue = document.getElementById("minRelevanceValue");

const MATCH_TYPE_LABEL = { hybrid: "Hybrid", semantic: "Semantic", keyword: "Keyword" };

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : text;
    return div.innerHTML;
}

const debouncedSearch = debounce(runSearch, 350);

function triggerSearch() {
    const q = searchQuery.value.trim();
    if (!q) {
        searchResults.innerHTML = "";
        searchEmpty.hidden = false;
        return;
    }
    debouncedSearch(q);
}

searchQuery.addEventListener("input", triggerSearch);
[filterMode, filterSort, filterPage].forEach((el) => el.addEventListener("change", triggerSearch));
filterMinRelevance.addEventListener("input", () => {
    minRelevanceValue.textContent = `${filterMinRelevance.value}%`;
});
filterMinRelevance.addEventListener("change", triggerSearch);

async function runSearch(q) {

    searchEmpty.hidden = true;
    searchResults.innerHTML = `<div class="search-loading" role="status">Searching…</div>`;

    const params = new URLSearchParams({
        q,
        mode: filterMode.value,
        sort: filterSort.value,
        min_relevance: (parseInt(filterMinRelevance.value, 10) / 100).toFixed(2),
    });
    if (filterPage.value) params.set("page", filterPage.value);

    try {
        const response = await authedFetch(`${API_URL}/api/search?${params.toString()}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            notifyFromResponse(response, "Search failed.");
            searchResults.innerHTML = `<div class="search-loading">Search failed.</div>`;
            return;
        }

        if (data.documents.length === 0) {
            searchResults.innerHTML = `<div class="search-loading">No matching documents found.</div>`;
            return;
        }

        searchResults.innerHTML = data.documents.map((doc) => `
            <div class="search-result-card">
                <h3>📄 ${escapeHTML(doc.filename)}</h3>
                ${doc.matches.map((m) => `
                    <div class="search-match" data-doc="${doc.document_id}" data-page="${m.page_number}" tabindex="0" role="button" aria-label="Open page ${m.page_number} of ${escapeHTML(doc.filename)}">
                        <span class="match-page">Page ${m.page_number}</span>
                        <span class="match-type-badge match-type-${m.match_type}">${MATCH_TYPE_LABEL[m.match_type] || m.match_type}</span>
                        <span class="match-relevance">${Math.round(m.relevance * 100)}% relevance</span>
                        <div>${escapeHTML(m.snippet)}</div>
                    </div>
                `).join("")}
            </div>
        `).join("");

        searchResults.querySelectorAll(".search-match").forEach((el) => {
            const go = () => { window.location.href = `chat.html?doc=${el.dataset.doc}&page=${el.dataset.page}`; };
            el.addEventListener("click", go);
            el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        });

    } catch (error) {
        console.error("SEARCH ERROR:", error);
        searchResults.innerHTML = `<div class="search-loading">Could not connect to the backend.</div>`;
        toastError("Could not connect to the backend.");
    }
}
