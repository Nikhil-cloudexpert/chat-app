const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Message = require("../models/Message");

// userId -> socketId
let onlineUsers = new Map();

const socketHandler = (io) => {
    // Middleware for authentication
    io.use(async (socket, next) => {
        try {
            // Check cookie for JWT
            const cookie = socket.handshake.headers.cookie;
            let token;
            if (cookie && cookie.includes("jwt=")) {
                token = cookie.split('jwt=')[1].split(';')[0];
            } else if (socket.handshake.auth.token) {
                token = socket.handshake.auth.token;
            }

            if (!token) {
                return next(new Error("Authentication error: No token"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select("-password");

            if (!user) {
                return next(new Error("User not found"));
            }

            socket.user = user;
            next();
        } catch (error) {
            next(new Error("Authentication error: " + error.message));
        }
    });

    io.on("connection", async (socket) => {
        console.log(`✅ Socket connected: ${socket.user.username} (${socket.id})`);

        // Add to online users
        onlineUsers.set(socket.user._id.toString(), socket.id);

        // Update user status
        await User.findByIdAndUpdate(socket.user._id, { status: "online" });

        // Broadcast user online
        io.emit("userStatus", { userId: socket.user._id, status: "online" });

        // Event: Send Message
        socket.on("sendMessage", async (data) => {
            const { receiverId, message } = data;
            const senderId = socket.user._id;

            // Save to DB
            const newMessage = await Message.create({
                senderId,
                receiverId,
                message,
            });

            const returnData = {
                _id: newMessage._id,
                senderId,
                receiverId,
                message,
                createdAt: newMessage.createdAt
            };

            // Emit to sender for confirmation
            socket.emit("receiveMessage", returnData);

            // Forward to receiver if online
            const receiverSocketId = onlineUsers.get(receiverId.toString());
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("receiveMessage", returnData);
            }
        });

        // Event: Typing
        socket.on("typing", (receiverId) => {
            const receiverSocketId = onlineUsers.get(receiverId.toString());
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("typing", { userId: socket.user._id });
            }
        });

        // Event: Stop Typing
        socket.on("stopTyping", (receiverId) => {
            const receiverSocketId = onlineUsers.get(receiverId.toString());
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("stopTyping", { userId: socket.user._id });
            }
        });

        socket.on("disconnect", async () => {
            console.log(`❌ Socket disconnected: ${socket.user.username}`);
            onlineUsers.delete(socket.user._id.toString());

            // Update user status
            await User.findByIdAndUpdate(socket.user._id, { status: "offline", lastSeen: Date.now() });

            // Broadcast offline status
            io.emit("userStatus", { userId: socket.user._id, status: "offline", lastSeen: new Date() });
        });
    });
};

module.exports = socketHandler;
