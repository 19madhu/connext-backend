import User from "../models/user.model.js";
import Message from "../models/message.model.js";

// ✅ SEARCH USERS (Excluding blocked ones)
export const searchUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const query = req.query.q?.trim();

    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const currentUser = await User.findById(currentUserId).select("blockedUsers");

    const users = await User.find({
      _id: { $ne: currentUserId, $nin: currentUser.blockedUsers },
      blockedUsers: { $ne: currentUserId },
      $or: [
        { fullName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    }).select("-password");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error in searchUsers controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ BLOCK USER
export const blockUser = async (req, res) => {
  try {
    const blockerId = req.user._id;
    const { userId } = req.params;

    // ✅ Access Socket.io instance and mapping function from app context
    const io = req.app.get("io");
    const getReceiverSocketId = req.app.get("getReceiverSocketId");

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    if (blockerId.toString() === userId) {
      return res.status(400).json({ message: "You cannot block yourself!" });
    }

    const blocker = await User.findById(blockerId);
    const blockedUser = await User.findById(userId);

    if (!blocker || !blockedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (blocker.blockedUsers.includes(userId)) {
      return res.status(400).json({ message: "User already blocked!" });
    }

    // ✅ Update blocked users and contacts
    blocker.blockedUsers.push(userId);
    blocker.contacts = blocker.contacts.filter((id) => id.toString() !== userId);
    await blocker.save();

    blockedUser.contacts = blockedUser.contacts.filter((id) => id.toString() !== blockerId.toString());
    await blockedUser.save();

    // ✅ Delete existing messages between blocker and blocked user
    await Message.deleteMany({
      $or: [
        { sender: blockerId, receiver: userId },
        { sender: userId, receiver: blockerId },
      ],
    });

    // ✅ Emit socket events to both blocker and blocked user (real-time UI update)
    const blockerSocketId = getReceiverSocketId(blockerId);
    const blockedSocketId = getReceiverSocketId(userId);

    if (blockerSocketId) {
      io.to(blockerSocketId).emit("block-success", { blockedUserId: userId });
    }

    if (blockedSocketId) {
      io.to(blockedSocketId).emit("user-blocked", { blockedBy: blockerId });
    }

    res.status(200).json({ message: "User blocked successfully!" });
  } catch (error) {
    console.error("Error in blockUser:", error);
    res.status(500).json({ message: "Failed to block user", error: error.message });
  }
};

// ✅ UNBLOCK USER
export const unblockUser = async (req, res) => {
  try {
    const blockerId = req.user._id;
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const blocker = await User.findById(blockerId);
    if (!blocker) {
      return res.status(404).json({ message: "Blocker not found" });
    }

    const blockedUser = await User.findById(userId);
    if (!blockedUser) {
      return res.status(404).json({ message: "User to unblock not found" });
    }

    if (!blocker.blockedUsers.includes(userId)) {
      return res.status(400).json({ message: "User is not in your blocked list" });
    }

    blocker.blockedUsers = blocker.blockedUsers.filter((id) => id.toString() !== userId);
    await blocker.save();

    res.status(200).json({ message: "User unblocked successfully!" });
  } catch (error) {
    console.error("Error in unblockUser:", error);
    res.status(500).json({ message: "Failed to unblock user", error: error.message });
  }
};

// ✅ GET BLOCKED USERS LIST
export const getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "blockedUsers",
      "fullName email profilePic"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user.blockedUsers);
  } catch (error) {
    console.error("Error in getBlockedUsers:", error);
    res.status(500).json({ message: "Failed to fetch blocked users", error: error.message });
  }
};