/**
 * Nexus Chat v2 · Frontend
 * Features: Auth, Text + Image/Video/GIF messaging, Typing, Animations
 */

// ── State ─────────────────────────────────────────────────────────────────────
let me           = null;
let activeUserId = null;
let allUsers     = [];
let conversations= {};
let unreadCounts = {};
let typingTimeout= null;
let isTyping     = false;
let pendingFile  = null;   // { file, previewUrl, type }

const socket = io();

// ── DOM ───────────────────────────────────────────────────────────────────────
const usersList       = document.getElementById("users-list");
const messagesArea    = document.getElementById("messages-area");
const messageInput    = document.getElementById("message-input");
const typingRow       = document.getElementById("typing-row");
const typingLabel     = document.getElementById("typing-label");
const emptyState      = document.getElementById("empty-state");
const activeChat      = document.getElementById("active-chat");
const sidebar         = document.getElementById("sidebar");
const chatPanel       = document.getElementById("chat-panel");
const uploadPreviewBar= document.getElementById("upload-preview-bar");
const uploadToast     = document.getElementById("upload-toast");
const toastText       = document.getElementById("toast-text");

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) { window.location.href = "/"; return; }
    me = await res.json();
  } catch { window.location.href = "/"; return; }

  setAvatar("me-avatar", me.username);
  setAvatar("profile-modal-avatar", me.username);
  document.getElementById("profile-modal-name").textContent = me.username;

  await Promise.all([loadUsers(), loadConversations(), loadUnread()]);
  buildEmojiPicker();

  messageInput.addEventListener("input", onInputChange);
  messageInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Close menus on outside click
  document.addEventListener("click", e => {
    if (!e.target.closest(".emoji-btn") && !e.target.closest(".emoji-picker"))
      document.getElementById("emoji-picker").classList.add("hidden");
    if (!e.target.closest(".attach-wrap"))
      document.getElementById("attach-menu").classList.add("hidden");
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
  try { const r = await fetch("/api/conversations"); conversations = await r.json(); } catch {}
}
async function loadUnread() {
  try { const r = await fetch("/api/unread"); unreadCounts = await r.json(); } catch {}
}

// ── Render user list ──────────────────────────────────────────────────────────
function renderUserList(users) {
  if (!users.length) {
    usersList.innerHTML = '<p style="text-align:center;color:var(--text-3);padding:24px;font-size:.85rem;line-height:1.7">No other users yet.<br>Open another browser<br>and register!</p>';
    return;
  }
  usersList.innerHTML = "";
  users.forEach((user, i) => {
    const lastMsg = conversations[user._id];
    const unread  = unreadCounts[user._id] || 0;
    const item    = document.createElement("div");
    item.className = "user-item" + (activeUserId === user._id ? " active" : "");
    item.dataset.userId = user._id;
    item.style.animationDelay = `${i * 0.045}s`;
    item.onclick = () => openChat(user);

    let preview = "";
    if (lastMsg) {
      const fromMe = (lastMsg.sender._id || lastMsg.sender) === me._id;
      if (lastMsg.mediaType === "image" || lastMsg.mediaType === "gif")
        preview = (fromMe ? "You: " : "") + "📷 Photo";
      else if (lastMsg.mediaType === "video")
        preview = (fromMe ? "You: " : "") + "🎥 Video";
      else {
        const t = lastMsg.text.length > 34 ? lastMsg.text.slice(0,34) + "…" : lastMsg.text;
        preview = (fromMe ? "You: " : "") + t;
      }
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

  document.querySelectorAll(".user-item").forEach(el =>
    el.classList.toggle("active", el.dataset.userId === user._id));

  unreadCounts[user._id] = 0;
  const badge = document.getElementById(`badge-${user._id}`);
  if (badge) badge.classList.add("hidden");

  cancelUpload();
  typingRow.classList.add("hidden");
  messagesArea.innerHTML = '<div style="display:flex;justify-content:center;padding:20px"><div class="spinner small"></div></div>';

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
  cancelUpload();
}

// ── Render messages ───────────────────────────────────────────────────────────
function renderMessages(msgs) {
  messagesArea.innerHTML = "";
  if (!msgs.length) {
    messagesArea.innerHTML = '<p style="text-align:center;color:var(--text-3);font-size:.85rem;padding:44px 0">No messages yet — say hello! 👋</p>';
    return;
  }
  let lastDate = null;
  msgs.forEach(msg => {
    const d  = new Date(msg.timestamp);
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
  const isMine   = senderId.toString() === me._id.toString();

  const row = document.createElement("div");
  row.className = `msg-row ${isMine ? "me" : "other"}`;
  if (!animate) row.style.animation = "none";

  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap";

  if (msg.mediaUrl && msg.mediaType) {
    // ── Media message
    const mediaBubble = document.createElement("div");
    mediaBubble.className = "media-bubble";

    if (msg.mediaType === "video") {
      // Video with play overlay
      const video = document.createElement("video");
      video.src = msg.mediaUrl;
      video.preload = "metadata";
      mediaBubble.appendChild(video);

      const overlay = document.createElement("div");
      overlay.className = "video-overlay";
      overlay.innerHTML = `<div class="play-icon"><svg viewBox="0 0 24 24" fill="none" width="22"><polygon points="5,3 19,12 5,21" fill="#333"/></svg></div>`;
      mediaBubble.appendChild(overlay);

      mediaBubble.onclick = () => openLightbox("video", msg.mediaUrl);
    } else {
      // Image / GIF
      const img = document.createElement("img");
      img.src  = msg.mediaUrl;
      img.alt  = msg.mediaName || "image";
      img.loading = "lazy";
      mediaBubble.appendChild(img);

      if (msg.mediaType === "gif") {
        const gifLabel = document.createElement("div");
        gifLabel.className = "gif-label";
        gifLabel.textContent = "GIF";
        mediaBubble.appendChild(gifLabel);
      }
      mediaBubble.onclick = () => openLightbox("image", msg.mediaUrl);
    }
    wrap.appendChild(mediaBubble);
  } else {
    // ── Text message
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = msg.text;
    wrap.appendChild(bubble);
  }

  const timeEl = document.createElement("div");
  timeEl.className = "bubble-time";
  timeEl.textContent = formatTime(new Date(msg.timestamp));
  wrap.appendChild(timeEl);

  row.appendChild(wrap);
  messagesArea.appendChild(row);
}

// ── Text message send ─────────────────────────────────────────────────────────
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

// ── Media upload ──────────────────────────────────────────────────────────────
function toggleAttachMenu() {
  const menu = document.getElementById("attach-menu");
  menu.classList.toggle("hidden");
}

function handleFileSelect(event, type) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = ""; // allow re-select

  document.getElementById("attach-menu").classList.add("hidden");

  const previewUrl = URL.createObjectURL(file);
  let mediaType = type;
  if (file.type === "image/gif") mediaType = "gif";

  pendingFile = { file, previewUrl, mediaType };
  showUploadPreview(file, previewUrl, mediaType);
}

function showUploadPreview(file, previewUrl, mediaType) {
  const bar     = document.getElementById("upload-preview-bar");
  const content = document.getElementById("upload-preview-content");
  const size    = formatFileSize(file.size);

  let mediaHtml = "";
  if (mediaType === "video") {
    mediaHtml = `<video src="${previewUrl}" muted></video>`;
  } else {
    mediaHtml = `<img src="${previewUrl}" alt="preview"/>`;
  }

  content.innerHTML = `
    ${mediaHtml}
    <div>
      <div class="upload-file-name">${escHtml(file.name)}</div>
      <div class="upload-file-size">${size}</div>
    </div>`;

  bar.classList.remove("hidden");
}

function cancelUpload() {
  pendingFile = null;
  document.getElementById("upload-preview-bar").classList.add("hidden");
  document.getElementById("upload-preview-content").innerHTML = "";
}

async function sendMediaMessage() {
  if (!pendingFile || !activeUserId) return;

  const { file } = pendingFile;
  cancelUpload();

  showToast(`Uploading ${formatFileSize(file.size)}...`);

  const formData = new FormData();
  formData.append("media", file);
  formData.append("receiverId", activeUserId);

  try {
    const res  = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    hideToast();
    if (!res.ok) { showToast("Upload failed: " + (data.error || "Unknown error"), true); return; }
  } catch (err) {
    hideToast();
    showToast("Upload failed", true);
    console.error(err);
  }
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(type, url) {
  const lb      = document.getElementById("lightbox");
  const content = document.getElementById("lightbox-content");

  if (type === "video") {
    content.innerHTML = `<video src="${url}" controls autoplay style="max-width:90vw;max-height:88vh;border-radius:14px"></video>`;
  } else {
    content.innerHTML = `<img src="${url}" alt="media" style="max-width:90vw;max-height:88vh;border-radius:14px"/>`;
  }
  lb.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
  document.getElementById("lightbox-content").innerHTML = "";
  document.body.style.overflow = "";
}

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

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on("receive_message", msg => {
  const senderId   = (msg.sender && msg.sender._id)   ? msg.sender._id   : msg.sender;
  const receiverId = (msg.receiver && msg.receiver._id) ? msg.receiver._id : msg.receiver;
  const otherId    = senderId.toString() === me._id.toString() ? receiverId.toString() : senderId.toString();

  conversations[otherId] = msg;

  if (activeUserId && otherId === activeUserId.toString()) {
    typingRow.classList.add("hidden");
    appendMessage(msg, true);
    scrollToBottom();
  } else if (senderId.toString() !== me._id.toString()) {
    const sid = senderId.toString();
    unreadCounts[sid] = (unreadCounts[sid] || 0) + 1;
    const badge = document.getElementById(`badge-${sid}`);
    if (badge) { badge.textContent = unreadCounts[sid]; badge.classList.remove("hidden"); }
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function filterUsers(query) {
  const q = query.toLowerCase();
  renderUserList(allUsers.filter(u => u.username.toLowerCase().includes(q)));
}

function updateSidebarPreview(userId, msg) {
  const prevEl = document.getElementById(`prev-${userId}`);
  const timeEl = document.getElementById(`time-${userId}`);
  if (prevEl) {
    const senderId = (msg.sender && msg.sender._id) ? msg.sender._id : msg.sender;
    const fromMe   = senderId.toString() === me._id.toString();
    let preview = "";
    if (msg.mediaType === "image" || msg.mediaType === "gif") preview = (fromMe ? "You: " : "") + "📷 Photo";
    else if (msg.mediaType === "video") preview = (fromMe ? "You: " : "") + "🎥 Video";
    else { const t = msg.text.length > 34 ? msg.text.slice(0,34)+"…" : msg.text; preview = (fromMe ? "You: " : "") + t; }
    prevEl.textContent = preview;
  }
  if (timeEl) timeEl.textContent = formatTime(new Date(msg.timestamp));
}

function updateChatStatus(online, lastSeen) {
  const dot  = document.getElementById("chat-status-dot");
  const text = document.getElementById("chat-status-text");
  dot.className = "status-indicator" + (online ? " online" : "");
  text.textContent = online ? "Online" : (lastSeen ? "Last seen " + formatTime(new Date(lastSeen)) : "Offline");
}

function scrollToBottom() {
  requestAnimationFrame(() => { messagesArea.scrollTop = messagesArea.scrollHeight; });
}

function showToast(msg, isError = false) {
  toastText.textContent = msg;
  uploadToast.classList.remove("hidden");
  if (isError) {
    uploadToast.style.borderColor = "rgba(239,68,68,0.3)";
    setTimeout(hideToast, 3000);
  } else {
    uploadToast.style.borderColor = "var(--border)";
  }
}
function hideToast() { uploadToast.classList.add("hidden"); }

function initials(name)  { return name.slice(0,2).toUpperCase(); }

function colorizeAvatar(el, username) {
  const palettes = [["#6C63FF","#3ECFCF"],["#f97316","#fbbf24"],["#22c55e","#10b981"],["#ec4899","#f43f5e"],["#3b82f6","#6366f1"],["#14b8a6","#0ea5e9"],["#a855f7","#ec4899"]];
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
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (date.toDateString() === y.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month:"short", day:"numeric" });
}

function formatDateLabel(date) {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (date.toDateString() === y.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday:"long", month:"long", day:"numeric" });
}

function formatFileSize(bytes) {
  if (bytes < 1024)        return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/1024/1024).toFixed(1) + " MB";
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function logout() {
  await fetch("/api/logout", { method:"POST" });
  window.location.href = "/";
}
function showProfile() { document.getElementById("profile-modal").classList.remove("hidden"); }
function hideProfile() { document.getElementById("profile-modal").classList.add("hidden"); }

// ── Start ─────────────────────────────────────────────────────────────────────
init();