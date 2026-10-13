const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("authError");
const submitBtn = document.getElementById("submitBtn");

// Already logged in? Skip straight to the app.
if (localStorage.getItem("paperchat-token")) {
    window.location.href = "index.html";
}

if (new URLSearchParams(window.location.search).get("expired")) {
    document.getElementById("expiredNotice").hidden = false;
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    errorBox.hidden = true;
    submitBtn.disabled = true;
    submitBtn.innerText = "Logging in…";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            localStorage.setItem("paperchat-token", data.access_token);
            localStorage.setItem("paperchat-user", JSON.stringify(data.user));
            window.location.href = "index.html";
        } else {
            errorBox.innerText = data.message || "Invalid email or password.";
            errorBox.hidden = false;
        }
    } catch (error) {
        console.error("LOGIN ERROR:", error);
        errorBox.innerText = "Could not connect to the backend.";
        errorBox.hidden = false;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Log In";
    }
});
