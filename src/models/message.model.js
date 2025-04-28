import mongoose from "mongoose";
import Group from "./group.model.js"; // ✅ Import Group model to update last active time

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return !this.group; // Only required if not a group message
      },
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    text: {
      type: String,
    },
    image: {
      type: String,
    },
  },
  { timestamps: true }
);

/** ✅ Trigger: Post-save Hook to update group's last active timestamp */
messageSchema.post("save", async function (doc, next) {
  try {
    if (doc.group) {
      await Group.findByIdAndUpdate(doc.group, { updatedAt: new Date() });
    }
    next();
  } catch (error) {
    console.error("Error updating group's last active timestamp:", error.message);
    next(error);
  }
});

const Message = mongoose.model("Message", messageSchema);

export default Message;