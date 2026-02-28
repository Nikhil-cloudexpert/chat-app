// ── State ─────────────────────────────────────────────────────────────────────
let me = null;
let activeUserId = null;
let allUsers = [];
let conversations = {};
let unreadCounts = {};
let typingTimeout = null;
let isTyping = false;

const socket = io();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const usersList    = document.getElementById("users-list");
const messagesArea = document.getElementById("messages-area");
const messageInput = document.getElementById("message-input");
const typingRow    = document.getElementById("typing-row");
const typingLabel  = document.getElementById("typing-label");
const emptyState   = document.getElementById("empty-state");
const activeChat   = document.getElementById("active-chat");
const sidebar      = document.getElementById("sidebar");
const chatPanel    = document.getElementById("chat-panel");

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) { window.location.href = "/"; return; }
    me = await res.json();
  } catch {
    window.location.href = "/";
    return;
  }

  setAvatar("me-avatar", me.username);
  setAvatar("profile-modal-avatar", me.username);
  document.getElementById("profile-modal-name").textContent = me.username;

  await Promise.all([loadUsers(), loadConversations(), loadUnread()]);
  buildEmojiPicker();

  messageInput.addEventListener("input", onInputChange);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".emoji-btn") && !e.target.closest(".emoji-picker")) {
      document.getElementById("emoji-picker").classList.add("hidden");
    }
  });
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await fetch("/api/users");
    allUsers = await res.json();
    renderUserList(allUsers);
  } catch {
    usersList.innerHTML = '<p style="text-align:center;color:var(--text-3);padding:20px;font-size:.85rem">Failed to load users</p>';
  }
}

async function loadConversations() {
  try {
    const res = await fetch("/api/conversations");
    conversations = await res.json();
  } catch {}
}

async function loadUnread() {
  try {
    const res = await fetch("/api/unread");
    unreadCounts = await res.json();
  } catch {}
}

// ── Render user list ──────────────────────────────────────────────────────────
function renderUserList(users) {
  if (!users.length) {
    usersList.innerHTML = '<p style="text-align:center;color:var(--text-3);padding:24px;font-size:.85rem;line-height:1.6">No other users yet.<br>Open another browser and register!</p>';
    return;
  }
  usersList.innerHTML = "";
  users.forEach((user, i) => {
    const lastMsg = conversations[user._id];
    const unread = unreadCounts[user._id] || 0;
    const item = document.createElement("div");
    item.className = "user-item" + (activeUserId === user._id ? " active" : "");
    item.dataset.userId = user._id;
    item.style.animationDelay = `${i * 0.04}s`;
    item.onclick = () => openChat(user);

    let preview = "";
    if (lastMsg) {
      const fromMe = (lastMsg.sender._id || lastMsg.sender) === me._id;
      const txt = lastMsg.text.length > 32 ? lastMsg.text.slice(0,32) + "…" : lastMsg.text;
      preview = (fromMe ? "You: " : "") + txt;
    } else {
      preview = user.online ? "Online now" : "Tap to chat";
    }
    const timeStr = lastMsg ? formatTime(new Date(lastMsg.timestamp)) : "";

    item.innerHTML = `
      <div class="user-avatar-wrap">
        <div class="user-avatar" id="ua-${user._id}">${initials(user.username)}</div>
        <div class="online-dot ${user.online ? "online" : ""}" id="dot-${user._id}"></div>
      </div>
      <div class="user-info">
        <div class="user-name">${escHtml(user.username)}</div>
        <div class="user-preview" id="prev-${user._id}">${escHtml(preview)}</div>
      </div>
      <div class="user-meta">
        <span class="user-time" id="time-${user._id}">${timeStr}</span>
        <div class="unread-badge ${unread > 0 ? "" : "hidden"}" id="badge-${user._id}">${unread}</div>
      </div>`;

    colorizeAvatar(item.querySelector(`#ua-${user._id}`), user.username);
    usersList.appendChild(item);
  });
}

// ── Open / close chat ─────────────────────────────────────────────────────────
async function openChat(user) {
  activeUserId = user._id;
  sidebar.classList.add("hidden-mobile");
  chatPanel.classList.add("visible");
  emptyState.classList.add("hidden");
  activeChat.classList.remove("hidden");

  const hAvatar = document.getElementById("chat-header-avatar");
  hAvatar.textContent = initials(user.username);
  colorizeAvatar(hAvatar, user.username);
  document.getElementById("chat-header-name").textContent = user.username;
  updateChatStatus(user.online, user.lastSeen);

  document.querySelectorAll(".user-item").forEach(el => {
    el.classList.toggle("active", el.dataset.userId === user._id);
  });

  unreadCounts[user._id] = 0;
  const badge = document.getElementById(`badge-${user._id}`);
  if (badge) badge.classList.add("hidden");

  messagesArea.innerHTML = '<div style="display:flex;justify-content:center;padding:20px"><div class="spinner small"></div></div>';
  typingRow.classList.add("hidden");

  try {
    const res = await fetch(`/api/messages/${user._id}`);
    const msgs = await res.json();
    renderMessages(msgs);
  } catch {
    messagesArea.innerHTML = '<p style="text-align:center;color:var(--text-3);font-size:.85rem">Failed to load messages</p>';
  }

  messageInput.focus();
}

function closeChat() {
  sidebar.classList.remove("hidden-mobile");
  chatPanel.classList.remove("visible");
  activeUserId = null;
}

// ── Render messages ───────────────────────────────────────────────────────────
function renderMessages(msgs) {
  messagesArea.innerHTML = "";
  if (!msgs.length) {
    messagesArea.innerHTML = '<p style="text-align:center;color:var(--text-3);font-size:.85rem;padding:40px 0">No messages yet. Say hello! 👋</p>';
    return;
  }
  let lastDate = null;
  msgs.forEach(msg => {
    const d = new Date(msg.timestamp);
    const ds = d.toDateString();
    if (ds !== lastDate) {
      lastDate = ds;
      const div = document.createElement("div");
      div.className = "day-div";
      div.innerHTML = `<span>${formatDateLabel(d)}</span>`;
      messagesArea.appendChild(div);
    }
    appendMessage(msg, false);
  });
  scrollToBottom();
}

function appendMessage(msg, animate) {
  const senderId = (msg.sender && msg.sender._id) ? msg.sender._id : msg.sender;
  const isMine = senderId.toString() === me._id.toString();
  const row = document.createElement("div");
  row.className = `msg-row ${isMine ? "me" : "other"}`;
  if (!animate) row.style.animation = "none";
  row.innerHTML = `
    <div class="bubble-wrap">
      <div class="bubble">${escHtml(msg.text)}</div>
      <div class="bubble-time">${formatTime(new Date(msg.timestamp))}</div>
    </div>`;
  messagesArea.appendChild(row);
}

// ── Send message ──────────────────────────────────────────────────────────────
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !activeUserId) return;
  socket.emit("send_message", { receiverId: activeUserId, text });
  stopTyping();
  messageInput.value = "";
  messageInput.style.height = "auto";
}

// ── Typing ────────────────────────────────────────────────────────────────────
function onInputChange() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 130) + "px";
  if (!isTyping && activeUserId) {
    isTyping = true;
    socket.emit("typing", { receiverId: activeUserId, isTyping: true });
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, 1800);
}

function stopTyping() {
  if (isTyping && activeUserId) {
    isTyping = false;
    socket.emit("typing", { receiverId: activeUserId, isTyping: false });
  }
  clearTimeout(typingTimeout);
}

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on("receive_message", (msg) => {
  const senderId = (msg.sender && msg.sender._id) ? msg.sender._id : msg.sender;
  const receiverId = (msg.receiver && msg.receiver._id) ? msg.receiver._id : msg.receiver;
  const otherId = senderId.toString() === me._id.toString() ? receiverId.toString() : senderId.toString();

  conversations[otherId] = msg;

  if (activeUserId && otherId === activeUserId.toString()) {
    typingRow.classList.add("hidden");
    appendMessage(msg, true);
    scrollToBottom();
  } else if (senderId.toString() !== me._id.toString()) {
    unreadCounts[senderId.toString()] = (unreadCounts[senderId.toString()] || 0) + 1;
    const badge = document.getElementById(`badge-${senderId}`);
    if (badge) { badge.textContent = unreadCounts[senderId.toString()]; badge.classList.remove("hidden"); }
  }
  updateSidebarPreview(otherId, msg);
});

socket.on("user_status", ({ userId, online }) => {
  const dot = document.getElementById(`dot-${userId}`);
  if (dot) dot.className = `online-dot ${online ? "online" : ""}`;
  const user = allUsers.find(u => u._id === userId);
  if (user) user.online = online;
  if (activeUserId === userId) updateChatStatus(online);
});

socket.on("user_typing", ({ senderId, isTyping: typing }) => {
  if (senderId !== activeUserId) return;
  if (typing) {
    const user = allUsers.find(u => u._id === senderId);
    typingLabel.textContent = (user ? user.username : "Someone") + " is typing...";
    typingRow.classList.remove("hidden");
  } else {
    typingRow.classList.add("hidden");
  }
});

// ── Emoji picker ──────────────────────────────────────────────────────────────
const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","😮","😢","😡","🎉","❤️","👍","👎","🙏","🔥","💯","⭐","🎵","🍕","🚀","🌟","✨","💪","🤝","👏","🥳","😊","😏","🤣","💀","👀","🙈","🎮","💻","📱","💡","🎯","🏆","🌈","🦄"];

function buildEmojiPicker() {
  const grid = document.getElementById("emoji-grid");
  EMOJIS.forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn-item";
    btn.textContent = emoji;
    btn.onclick = () => {
      const pos = messageInput.selectionStart;
      messageInput.value = messageInput.value.slice(0,pos) + emoji + messageInput.value.slice(pos);
      messageInput.setSelectionRange(pos + emoji.length, pos + emoji.length);
      messageInput.focus();
      document.getElementById("emoji-picker").classList.add("hidden");
    };
    grid.appendChild(btn);
  });
}

function toggleEmojiPicker() {
  document.getElementById("emoji-picker").classList.toggle("hidden");
}

// ── Filter users ──────────────────────────────────────────────────────────────
function filterUsers(query) {
  const q = query.toLowerCase();
  renderUserList(allUsers.filter(u => u.username.toLowerCase().includes(q)));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateSidebarPreview(userId, msg) {
  const prevEl = document.getElementById(`prev-${userId}`);
  const timeEl = document.getElementById(`time-${userId}`);
  if (prevEl) {
    const senderId = (msg.sender && msg.sender._id) ? msg.sender._id : msg.sender;
    const fromMe = senderId.toString() === me._id.toString();
    const txt = msg.text.length > 32 ? msg.text.slice(0,32) + "…" : msg.text;
    prevEl.textContent = (fromMe ? "You: " : "") + txt;
  }
  if (timeEl) timeEl.textContent = formatTime(new Date(msg.timestamp));
}

function updateChatStatus(online, lastSeen) {
  const dot = document.getElementById("chat-status-dot");
  const text = document.getElementById("chat-status-text");
  dot.className = "status-indicator" + (online ? " online" : "");
  text.textContent = online ? "Online" : (lastSeen ? "Last seen " + formatTime(new Date(lastSeen)) : "Offline");
}

function scrollToBottom() {
  requestAnimationFrame(() => { messagesArea.scrollTop = messagesArea.scrollHeight; });
}

function initials(name) { return name.slice(0,2).toUpperCase(); }

function colorizeAvatar(el, username) {
  const palettes = [["#6C63FF","#3ECFCF"],["#f97316","#fbbf24"],["#22c55e","#10b981"],["#ec4899","#f43f5e"],["#3b82f6","#6366f1"],["#14b8a6","#0ea5e9"]];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash += username.charCodeAt(i);
  const [from, to] = palettes[hash % palettes.length];
  el.style.background = `linear-gradient(135deg,${from},${to})`;
}

function setAvatar(id, username) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = initials(username);
  colorizeAvatar(el, username);
}

function formatTime(date) {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (date.toDateString() === y.toDateString()) return "Yesterday";
  return date.toLocaleDateString([],{month:"short",day:"numeric"});
}

function formatDateLabel(date) {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (date.toDateString() === y.toDateString()) return "Yesterday";
  return date.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
}

function showProfile() { document.getElementById("profile-modal").classList.remove("hidden"); }
function hideProfile() { document.getElementById("profile-modal").classList.add("hidden"); }

// ── Start ─────────────────────────────────────────────────────────────────────
init();
