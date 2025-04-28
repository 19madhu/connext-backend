import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  groupImage: {
    type: String,
    default: "/avatar.png",
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

/** ✅ Trigger: Post-save Hook to log group creation */
groupSchema.post("save", function (doc, next) {
  console.log(`📢 New group created: '${doc.name}' with ID: ${doc._id}`);
  next();
});

const Group = mongoose.model("Group", groupSchema);

export default Group;