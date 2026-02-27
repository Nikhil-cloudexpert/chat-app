const chatApp = document.getElementById("chatApp");
const userList = document.getElementById("userList");
const chatMain = document.getElementById("chatMain");
const emptyChat = document.getElementById("emptyChat");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const currentUserDisplay = document.getElementById("currentUserDisplay");
const logoutBtn = document.getElementById("logoutBtn");
const backBtn = document.getElementById("backBtn");
const sidebar = document.getElementById("sidebar");

const chatHeaderName = document.getElementById("chatHeaderName");
const chatHeaderAvatar = document.getElementById("chatHeaderAvatar");
const chatHeaderStatus = document.getElementById("chatHeaderStatus");
const typingIndicator = document.getElementById("typingIndicator");

let currentUser = null;
let selectedUser = null;
let socket = null;
let users = [];

// Initialize app
async function init() {
    try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) {
            window.location.href = "login.html";
            return;
        }
        currentUser = await response.json();
        currentUserDisplay.textContent = currentUser.username;
        chatApp.style.display = "flex";

        initSocket();
        loadUsers();
    } catch (error) {
        console.error("Auth error", error);
        window.location.href = "login.html";
    }
}

// Socket Initialization
function initSocket() {
    socket = io(); // Connects using cookie automatically

    socket.on("connect_error", (err) => {
        console.error("Socket Auth Error:", err.message);
    });

    socket.on("receiveMessage", (message) => {
        // If message is for/from current selected user, append to DOM
        if (selectedUser &&
            (message.senderId === selectedUser._id || message.receiverId === selectedUser._id)) {
            appendMessage(message);
        } else {
            // Otherwise, just show a badge or update latest message in sidebar
            loadUsers(); // Refresh user list to show updated status/notification
        }
    });

    socket.on("userStatus", ({ userId, status, lastSeen }) => {
        // Update user object
        const userIndex = users.findIndex(u => u._id === userId);
        if (userIndex !== -1) {
            users[userIndex].status = status;
            if (lastSeen) users[userIndex].lastSeen = lastSeen;
            renderUsers();

            // Update header if selected
            if (selectedUser && selectedUser._id === userId) {
                updateChatHeaderStatus(status, lastSeen);
            }
        }
    });

    socket.on("typing", ({ userId }) => {
        if (selectedUser && selectedUser._id === userId) {
            typingIndicator.style.display = "block";
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });

    socket.on("stopTyping", ({ userId }) => {
        if (selectedUser && selectedUser._id === userId) {
            typingIndicator.style.display = "none";
        }
    });
}

// Load Users for Sidebar
async function loadUsers() {
    try {
        const response = await fetch("/api/chat/users");
        if (response.ok) {
            users = await response.json();
            renderUsers();
        }
    } catch (error) {
        console.error("Error loading users:", error);
    }
}

// Render User List
function renderUsers() {
    userList.innerHTML = "";

    if (users.length === 0) {
        userList.innerHTML = '<li style="padding: 1rem; text-align: center; color: #888;">No users found</li>';
        return;
    }

    users.forEach(user => {
        const li = document.createElement("li");
        li.className = "user-item";
        if (selectedUser && selectedUser._id === user._id) {
            li.classList.add("active");
        }

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = user.username.charAt(0).toUpperCase();

        const info = document.createElement("div");
        info.className = "user-info";

        const nameDiv = document.createElement("div");
        nameDiv.className = "user-name";
        nameDiv.textContent = user.username;

        const statusDiv = document.createElement("div");
        statusDiv.className = "user-status";

        const dot = document.createElement("span");
        dot.className = "status-dot " + (user.status === 'online' ? 'online' : '');

        statusDiv.appendChild(dot);
        statusDiv.appendChild(document.createTextNode(user.status || "offline"));

        info.appendChild(nameDiv);
        info.appendChild(statusDiv);

        li.appendChild(avatar);
        li.appendChild(info);

        li.addEventListener("click", () => selectUser(user));

        userList.appendChild(li);
    });
}

// Select a user to chat
async function selectUser(user) {
    selectedUser = user;
    renderUsers(); // To update active class

    emptyChat.style.display = "none";
    chatMain.style.display = "flex";

    chatHeaderName.textContent = user.username;
    chatHeaderAvatar.textContent = user.username.charAt(0).toUpperCase();
    updateChatHeaderStatus(user.status, user.lastSeen);

    // Load messages
    chatMessages.innerHTML = "";
    try {
        const response = await fetch(`/api/chat/messages/${user._id}`);
        if (response.ok) {
            const messages = await response.json();
            messages.forEach(appendMessage);
        }
    } catch (error) {
        console.error("Error loading messages", error);
    }

    // On mobile, hide sidebar
    if (window.innerWidth <= 768) {
        sidebar.classList.add("hidden");
    }
}

function updateChatHeaderStatus(status, lastSeen) {
    if (status === "online") {
        chatHeaderStatus.textContent = "Online";
        chatHeaderStatus.style.color = "#4caf50";
    } else {
        chatHeaderStatus.style.color = "var(--text-light)";
        if (lastSeen) {
            const date = new Date(lastSeen);
            chatHeaderStatus.textContent = `Last seen ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            chatHeaderStatus.textContent = "Offline";
        }
    }
}

function appendMessage(message) {
    const isSentByMe = message.senderId === currentUser._id;

    const div = document.createElement("div");
    div.className = `message ${isSentByMe ? "sent" : "received"}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = message.message;

    const timestamp = document.createElement("div");
    timestamp.className = "timestamp";
    const date = new Date(message.createdAt);
    timestamp.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.appendChild(timestamp);
    div.appendChild(bubble);

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send Message
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const content = messageInput.value.trim();

    if (content && selectedUser) {
        socket.emit("sendMessage", {
            receiverId: selectedUser._id,
            message: content
        });
        messageInput.value = "";
        socket.emit("stopTyping", selectedUser._id);
    }
});

// Typing Indicator logic
let typingTimer;
messageInput.addEventListener("input", () => {
    if (!selectedUser) return;

    socket.emit("typing", selectedUser._id);
    clearTimeout(typingTimer);

    typingTimer = setTimeout(() => {
        socket.emit("stopTyping", selectedUser._id);
    }, 2000);
});

// Logout
logoutBtn.addEventListener("click", async () => {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout failed", error);
    }
});

// Mobile Back Button
backBtn.addEventListener("click", () => {
    sidebar.classList.remove("hidden");
});

// Start
init();
