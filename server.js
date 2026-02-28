/**
 * Nexus Chat v2 — Server
 * Express + Socket.io + MongoDB + Session Auth + Multer Media Uploads
 */

const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const mongoose   = require("mongoose");
const session    = require("express-session");
const MongoStore = require("connect-mongo");
const multer     = require("multer");
const path       = require("path");
const fs         = require("fs");

const User    = require("./models/User");
const Message = require("./models/Message");

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT           = process.env.PORT || 3000;
const MONGO_URI      = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexuschat";
const SESSION_SECRET = process.env.SESSION_SECRET || "nexus_secret_v2";
const UPLOADS_DIR    = path.join(__dirname, "public", "uploads");

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── App ──────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ─── Session ──────────────────────────────────────────────────────────────────
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI, ttl: 7 * 24 * 60 * 60 }),
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));

// ─── Socket.io ────────────────────────────────────────────────────────────────
const io = new Server(server, { cors: { origin: "*" } });
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

// ─── MongoDB ──────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB:", err.message));

// ─── Multer Setup ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /^(image|video)\//;
  if (allowed.test(file.mimetype)) cb(null, true);
  else cb(new Error("Only images, videos, and GIFs are allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/chat");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/chat", (req, res) => {
  if (!req.session.userId) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    if (username.trim().length < 2) return res.status(400).json({ error: "Username must be at least 2 characters" });
    if (password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });
    const existing = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, "i") } });
    if (existing) return res.status(409).json({ error: "Username already taken" });
    const user = await User.create({ username: username.trim(), password });
    req.session.userId = user._id;
    req.session.username = user.username;
    res.json({ success: true, user: { id: user._id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    const user = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, "i") } });
    if (!user) return res.status(401).json({ error: "Invalid username or password" });
    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: "Invalid username or password" });
    req.session.userId = user._id;
    req.session.username = user.username;
    res.json({ success: true, user: { id: user._id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/logout", async (req, res) => {
  if (req.session.userId) await User.findByIdAndUpdate(req.session.userId, { online: false, lastSeen: new Date() });
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).select("-password");
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(user);
});

app.get("/api/users", requireAuth, async (req, res) => {
  const users = await User.find({ _id: { $ne: req.session.userId } }).select("-password").sort({ online: -1, username: 1 });
  res.json(users);
});

app.get("/api/messages/:userId", requireAuth, async (req, res) => {
  const me = req.session.userId;
  const other = req.params.userId;
  const messages = await Message.find({
    $or: [{ sender: me, receiver: other }, { sender: other, receiver: me }],
  }).sort({ timestamp: 1 }).limit(100).populate("sender", "username").populate("receiver", "username").lean();
  await Message.updateMany({ sender: other, receiver: me, read: false }, { read: true });
  res.json(messages);
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  const me = req.session.userId;
  const messages = await Message.find({ $or: [{ sender: me }, { receiver: me }] })
    .sort({ timestamp: -1 })
    .populate("sender", "username")
    .populate("receiver", "username")
    .lean();
  const map = new Map();
  for (const msg of messages) {
    const otherId = msg.sender._id.toString() === me.toString() ? msg.receiver._id.toString() : msg.sender._id.toString();
    if (!map.has(otherId)) map.set(otherId, msg);
  }
  res.json(Object.fromEntries(map));
});

app.get("/api/unread", requireAuth, async (req, res) => {
  const me = req.session.userId;
  const counts = await Message.aggregate([
    { $match: { receiver: new mongoose.Types.ObjectId(me), read: false } },
    { $group: { _id: "$sender", count: { $sum: 1 } } },
  ]);
  const result = {};
  counts.forEach(c => { result[c._id.toString()] = c.count; });
  res.json(result);
});

// ─── Media Upload Endpoint ────────────────────────────────────────────────────
app.post("/api/upload", requireAuth, upload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { receiverId } = req.body;
    if (!receiverId) return res.status(400).json({ error: "receiverId required" });

    // Determine media type
    let mediaType = "image";
    if (req.file.mimetype.startsWith("video/")) mediaType = "video";
    else if (req.file.mimetype === "image/gif") mediaType = "gif";

    const mediaUrl = "/uploads/" + req.file.filename;

    const msg = await Message.create({
      sender: req.session.userId,
      receiver: receiverId,
      text: "",
      mediaUrl,
      mediaType,
      mediaName: req.file.originalname,
    });

    const populated = await msg.populate([
      { path: "sender", select: "username" },
      { path: "receiver", select: "username" },
    ]);

    const payload = populated.toObject();

    // Emit via socket to both users
    const userSockets = req.app.get("userSockets");
    const senderSocket = userSockets && userSockets.get(req.session.userId.toString());
    const receiverSocket = userSockets && userSockets.get(receiverId.toString());

    if (senderSocket) senderSocket.emit("receive_message", payload);
    if (receiverSocket) receiverSocket.emit("receive_message", payload);

    res.json({ success: true, message: payload });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
const userSockets = new Map();
app.set("userSockets", userSockets);

io.on("connection", async (socket) => {
  const sess = socket.request.session;
  if (!sess || !sess.userId) { socket.disconnect(); return; }

  const userId   = sess.userId.toString();
  const username = sess.username;
  userSockets.set(userId, socket);
  console.log(`🔌 ${username} connected`);

  await User.findByIdAndUpdate(userId, { online: true });
  io.emit("user_status", { userId, online: true });

  socket.on("send_message", async ({ receiverId, text }) => {
    if (!text || !text.trim() || !receiverId) return;
    try {
      const msg = await Message.create({ sender: userId, receiver: receiverId, text: text.trim() });
      const populated = await msg.populate([
        { path: "sender", select: "username" },
        { path: "receiver", select: "username" },
      ]);
      const payload = populated.toObject();
      socket.emit("receive_message", payload);
      const receiverSocket = userSockets.get(receiverId.toString());
      if (receiverSocket) receiverSocket.emit("receive_message", payload);
    } catch (err) {
      console.error("Message error:", err.message);
    }
  });

  socket.on("typing", ({ receiverId, isTyping }) => {
    const receiverSocket = userSockets.get(receiverId.toString());
    if (receiverSocket) receiverSocket.emit("user_typing", { senderId: userId, isTyping });
  });

  socket.on("disconnect", async () => {
    userSockets.delete(userId);
    await User.findByIdAndUpdate(userId, { online: false, lastSeen: new Date() });
    io.emit("user_status", { userId, online: false });
    console.log(`👋 ${username} disconnected`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Server at http://localhost:${PORT}`);
});
