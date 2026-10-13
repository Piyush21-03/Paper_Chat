// Shared shell behavior: sidebar active-link highlighting, theme
// toggle (persisted to localStorage), mobile sidebar open/close, a
// small debounce helper, and authentication (token storage, an authed
// fetch wrapper, and a protected-page guard). Only pages that include
// shell.js are treated as protected -- login.html/register.html don't
// load it.

const THEME_KEY = "paperchat-theme";
const TOKEN_KEY = "paperchat-token";
const USER_KEY = "paperchat-user";

function apiBase() {
    return window.location.protocol.startsWith("http")
        ? window.location.origin
        : "http://127.0.0.1:8000";
}

function getToken() { return localStorage.getItem(TOKEN_KEY); }

function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function getCachedUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
}

// Redirect unauthenticated visitors away from protected pages. Runs as
// soon as shell.js executes (not deferred to DOMContentLoaded) to
// minimize how long protected content is visible before redirecting.
function requireAuth() {
    if (!getToken()) {
        window.location.href = "login.html";
    }
}

requireAuth();

// Drop-in replacement for fetch() that attaches the bearer token and
// handles session expiry/invalidation consistently everywhere.
async function authedFetch(url, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        clearSession();
        window.location.href = "login.html?expired=1";
    }

    return response;
}

// Downloads a protected file (table CSV/XLSX etc). A plain <a href>
// can't carry the Authorization header, so fetch it as a blob instead.
async function downloadAuthed(url, filename) {
    try {
        const response = await authedFetch(url);
        if (!response.ok) return;
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
    } catch (error) {
        console.error("DOWNLOAD ERROR:", error);
    }
}

function renderAccountArea() {
    const user = getCachedUser();
    const footer = document.querySelector(".shell-sidebar-footer");
    if (!footer || !user) return;

    footer.innerHTML = `
        <div class="account-email" title="${user.email}">${user.email}</div>
        <button id="logoutBtn" class="logout-btn">Log out</button>
    `;

    document.getElementById("logoutBtn").addEventListener("click", async () => {
        try { await authedFetch(`${apiBase()}/api/auth/logout`, { method: "POST" }); } catch (e) { /* ignore */ }
        clearSession();
        window.location.href = "login.html";
    });
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    updateThemeButton();
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeButton();
}

function updateThemeButton() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    btn.innerText = current === "dark" ? "☀️" : "🌙";
    btn.title = current === "dark" ? "Switch to light mode" : "Switch to dark mode";
}

function initSidebarNav() {

    const page = document.body.dataset.page;

    document.querySelectorAll(".shell-nav a").forEach((link) => {
        link.classList.toggle("active", link.dataset.nav === page);
    });

    const sidebar = document.querySelector(".shell-sidebar");
    const toggle = document.getElementById("shellSidebarToggle");

    if (toggle && sidebar) {
        toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
    }
}

function debounce(fn, wait) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

// ========================================
// Toast notification system (replaces alert() for normal app events).
// Available on every page that loads shell.js.
// ========================================

function _ensureToastContainer() {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        container.setAttribute("role", "status");
        container.setAttribute("aria-live", "polite");
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = "info", timeoutMs = 4500) {
    const container = _ensureToastContainer();

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");

    const icon = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" }[type] || "ℹ";

    toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${icon}</span>
        <span class="toast-message"></span>
        <button class="toast-close" aria-label="Dismiss notification">✕</button>
    `;
    toast.querySelector(".toast-message").textContent = message;

    const remove = () => {
        toast.classList.add("toast-leaving");
        setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector(".toast-close").addEventListener("click", remove);
    if (timeoutMs) setTimeout(remove, timeoutMs);

    container.appendChild(toast);
    return remove;
}

const toastSuccess = (msg, ms) => showToast(msg, "success", ms);
const toastError = (msg, ms) => showToast(msg, "error", ms);
const toastWarning = (msg, ms) => showToast(msg, "warning", ms);
const toastInfo = (msg, ms) => showToast(msg, "info", ms);

// Maps a fetch/authedFetch Response (or a caught network error) to a
// consistent, human-readable toast. Centralizes handling for the
// common HTTP status codes the app can return.
function notifyFromResponse(response, fallbackMessage) {
    if (!response) {
        toastError("Network error — could not reach the server.");
        return;
    }

    const byStatus = {
        400: fallbackMessage || "That request wasn't valid.",
        401: "Your session has expired. Please log in again.",
        403: "You don't have access to that.",
        404: "That item couldn't be found.",
        409: "That action conflicts with the current state — try again.",
        413: "That file is too large.",
        422: "Some of the submitted data wasn't valid.",
        429: "You're sending requests too quickly. Please wait a moment and try again.",
        500: "Something went wrong on our end. Please try again.",
        503: "The service is temporarily unavailable. Please try again shortly.",
    };

    toastError(byStatus[response.status] || fallbackMessage || `Request failed (${response.status}).`);
}

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initSidebarNav();
    renderAccountArea();
    const themeBtn = document.getElementById("themeToggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
});
