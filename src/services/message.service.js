import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

/** ✅ Stored Procedure: Send Message Service */
export const sendMessageService = async (senderId, receiverId, text, image) => {
  let imageUrl;

  if (image) {
    const uploadResponse = await cloudinary.uploader.upload(image);
    imageUrl = uploadResponse.secure_url;
  }

  const newMessage = new Message({
    senderId,
    receiverId,
    text,
    image: imageUrl,
  });

  await newMessage.save();

  // ✅ Update contacts (bidirectional)
  const sender = await User.findById(senderId);
  const receiver = await User.findById(receiverId);

  if (!sender.contacts.includes(receiverId)) {
    sender.contacts.push(receiverId);
    await sender.save();
  }
  if (!receiver.contacts.includes(senderId)) {
    receiver.contacts.push(senderId);
    await receiver.save();
  }

  const receiverSocketId = getReceiverSocketId(receiverId);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("newMessage", newMessage);
  }

  return newMessage;
};

/** ✅ Stored Procedure: Get Users With Last Message (Aggregation View Equivalent) */
export const getLastMessageService = async (loggedInUserId) => {
  const messageContacts = await Message.aggregate([
    {
      $match: {
        $or: [
          { senderId: loggedInUserId },
          { receiverId: loggedInUserId },
        ],
      },
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ["$senderId", loggedInUserId] },
            "$receiverId",
            "$senderId",
          ],
        },
      },
    },
  ]);

  const contactIds = messageContacts.map((contact) => contact._id?.toString()).filter(Boolean);

  const loggedInUser = await User.findById(loggedInUserId).select("blockedUsers");
  const myBlockedUsers = loggedInUser.blockedUsers.map((id) => id.toString());

  const usersWhoBlockedMeDocs = await User.find({ blockedUsers: { $in: [loggedInUserId] } }).select("_id");
  const usersWhoBlockedMe = usersWhoBlockedMeDocs.map((user) => user._id.toString());

  const filteredContactIds = contactIds.filter(
    (id) => !myBlockedUsers.includes(id) && !usersWhoBlockedMe.includes(id)
  );

  const users = await User.aggregate([
    { $match: { _id: { $in: filteredContactIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    {
      $lookup: {
        from: "messages",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $and: [{ $eq: ["$senderId", loggedInUserId] }, { $eq: ["$receiverId", "$$userId"] }] },
                  { $and: [{ $eq: ["$senderId", "$$userId"] }, { $eq: ["$receiverId", loggedInUserId] }] },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
        ],
        as: "lastMessage",
      },
    },
    {
      $addFields: {
        lastMessageTimestamp: { $ifNull: [{ $arrayElemAt: ["$lastMessage.createdAt", 0] }, new Date(0)] },
        lastMessageText: { $arrayElemAt: ["$lastMessage.text", 0] },
      },
    },
    { $sort: { lastMessageTimestamp: -1 } },
    { $project: { password: 0, lastMessage: 0 } },
  ]);

  return users;
};