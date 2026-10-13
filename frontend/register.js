const API_URL = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:8000";

const form = document.getElementById("registerForm");
const errorBox = document.getElementById("authError");
const submitBtn = document.getElementById("submitBtn");

if (localStorage.getItem("paperchat-token")) {
    window.location.href = "index.html";
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    errorBox.hidden = true;
    submitBtn.disabled = true;
    submitBtn.innerText = "Creating account…";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (password.length < 8) {
        errorBox.innerText = "Password must be at least 8 characters.";
        errorBox.hidden = false;
        submitBtn.disabled = false;
        submitBtn.innerText = "Create Account";
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/auth/register`, {
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
            errorBox.innerText = data.message || "Could not create account.";
            errorBox.hidden = false;
        }
    } catch (error) {
        console.error("REGISTER ERROR:", error);
        errorBox.innerText = "Could not connect to the backend.";
        errorBox.hidden = false;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Create Account";
    }
});
