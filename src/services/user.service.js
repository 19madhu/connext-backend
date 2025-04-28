import User from "../models/user.model.js";
import Message from "../models/message.model.js";

/** ✅ BLOCK USER PROCEDURE */
export const blockUserService = async (blockerId, userId) => {
  const blocker = await User.findById(blockerId);
  const blockedUser = await User.findById(userId);

  if (!blocker || !blockedUser) throw new Error("User not found");

  if (blocker.blockedUsers.includes(userId)) {
    throw new Error("User already blocked!");
  }

  blocker.blockedUsers.push(userId);
  blocker.contacts = blocker.contacts.filter((id) => id.toString() !== userId);
  await blocker.save();

  blockedUser.contacts = blockedUser.contacts.filter((id) => id.toString() !== blockerId.toString());
  await blockedUser.save();

  await Message.deleteMany({
    $or: [
      { senderId: blockerId, receiverId: userId },
      { senderId: userId, receiverId: blockerId },
    ],
  });

  return { message: "User blocked successfully" };
};

/** ✅ UNBLOCK USER PROCEDURE */
export const unblockUserService = async (blockerId, userId) => {
  const blocker = await User.findById(blockerId);
  if (!blocker) throw new Error("Blocker not found");

  if (!blocker.blockedUsers.includes(userId)) {
    throw new Error("User is not in blocked list");
  }

  blocker.blockedUsers = blocker.blockedUsers.filter((id) => id.toString() !== userId);
  await blocker.save();

  return { message: "User unblocked successfully" };
};

/** ✅ SEARCH USERS PROCEDURE */
export const searchUsersService = async (currentUserId, query) => {
  const currentUser = await User.findById(currentUserId).select("blockedUsers");

  const users = await User.find({
    _id: { $ne: currentUserId, $nin: currentUser.blockedUsers },
    blockedUsers: { $ne: currentUserId },
    $or: [
      { fullName: { $regex: query, $options: "i" } },
      { email: { $regex: query, $options: "i" } },
    ],
  }).select("-password");

  return users;
};