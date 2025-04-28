import User from "../models/user.model.js";
import Message from "../models/message.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import mongoose from "mongoose";

const toObjectId = (id) => {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
};

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUser = await User.findById(req.user._id).populate("contacts", "-password");

    if (!loggedInUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(loggedInUser.contacts);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

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

    // ✅ Add each user to the other's contacts list
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

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUsersWithLastMessage = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // ✅ Step 1: Find all user IDs with at least one message exchanged with the logged-in user
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

    if (contactIds.length === 0) {
      return res.status(200).json([]); // No contacts if no messages exchanged
    }

    // ✅ Step 2: Get blocker list (users I blocked)
    const loggedInUser = await User.findById(loggedInUserId).select("blockedUsers");
    const myBlockedUsers = loggedInUser.blockedUsers.map((id) => id.toString());

    // ✅ Step 3: Get users who blocked me
    const usersWhoBlockedMeDocs = await User.find({
      blockedUsers: { $in: [loggedInUserId] },
    }).select("_id");

    const usersWhoBlockedMe = usersWhoBlockedMeDocs.map((user) => user._id.toString());

    // ✅ Step 4: Filter out blocked users from contactIds
    const filteredContactIds = contactIds.filter(
      (id) => !myBlockedUsers.includes(id) && !usersWhoBlockedMe.includes(id)
    );

    if (filteredContactIds.length === 0) {
      return res.status(200).json([]); // No contacts left after filtering
    }

    // ✅ Step 5: Safe ObjectId conversion + fetching last messages
    const users = await User.aggregate([
      {
        $match: {
          _id: {
            $in: filteredContactIds.map(toObjectId).filter((id) => id !== null),
          },
        },
      },
      {
        $lookup: {
          from: "messages",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    {
                      $and: [
                        { $eq: ["$senderId", loggedInUserId] },
                        { $eq: ["$receiverId", "$$userId"] },
                      ],
                    },
                    {
                      $and: [
                        { $eq: ["$senderId", "$$userId"] },
                        { $eq: ["$receiverId", loggedInUserId] },
                      ],
                    },
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
          lastMessageTimestamp: {
            $ifNull: [{ $arrayElemAt: ["$lastMessage.createdAt", 0] }, new Date(0)],
          },
          lastMessageText: { $arrayElemAt: ["$lastMessage.text", 0] },
        },
      },
      { $sort: { lastMessageTimestamp: -1 } },
      { $project: { password: 0, lastMessage: 0 } },
    ]);

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users with last message:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};
