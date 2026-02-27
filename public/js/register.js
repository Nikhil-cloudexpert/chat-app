const registerForm = document.getElementById("registerForm");
const errorMessage = document.getElementById("errorMessage");

registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch("/api/auth/register", {
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
            errorMessage.textContent = data.message || "Registration failed";
            errorMessage.style.display = "block";
        }
    } catch (error) {
        errorMessage.textContent = "An error occurred during registration";
        errorMessage.style.display = "block";
    }
});
