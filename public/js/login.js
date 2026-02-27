const loginForm = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            window.location.href = "chat.html";
        } else {
            errorMessage.textContent = data.message || "Login failed";
            errorMessage.style.display = "block";
        }
    } catch (error) {
        errorMessage.textContent = "An error occurred during login";
        errorMessage.style.display = "block";
    }
});
