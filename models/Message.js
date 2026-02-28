const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text:      { type: String, trim: true, maxlength: 4000, default: "" },
  // Media fields
  mediaUrl:  { type: String, default: "" },         // path to uploaded file
  mediaType: { type: String, default: "" },          // "image" | "video" | "gif"
  mediaName: { type: String, default: "" },          // original filename
  timestamp: { type: Date, default: Date.now },
  read:      { type: Boolean, default: false },
});

messageSchema.index({ sender: 1, receiver: 1, timestamp: 1 });

module.exports = mongoose.model("Message", messageSchema);
