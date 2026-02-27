const express = require("express");
const { getUsers, getMessages } = require("../controllers/chatController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/users", protect, getUsers);
router.get("/messages/:userId", protect, getMessages);

module.exports = router;
