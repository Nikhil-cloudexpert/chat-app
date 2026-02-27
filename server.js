const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const connectDB = require("./src/config/db");

// Load env vars
dotenv.config();

// Connect to DB
connectDB();

const app = express();
const server = http.createServer(app);

const authRoutes = require("./src/routes/authRoutes");
const chatRoutes = require("./src/routes/chatRoutes");

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static("public"));

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for now, tighten later
    methods: ["GET", "POST"]
  }
});

// Root route
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

const socketHandler = require("./src/socket/socketHandler");
socketHandler(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
