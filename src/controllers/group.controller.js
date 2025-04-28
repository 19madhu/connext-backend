import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";
import { io, getReceiverSocketId } from "../lib/socket.js";
import cloudinary from "../lib/cloudinary.js";
import Message from "../models/message.model.js";

const { ObjectId } = mongoose.Types;

/** ✅ CREATE GROUP */
export const createGroup = async (req, res) => {
  try {
    const { name, members, groupImage } = req.body;
    const adminId = req.user._id;

    if (!name) {
      return res.status(400).json({ message: "Group name is required" });
    }

    const adminUser = await User.findById(adminId);
    const validMembers = members.filter((memberId) =>
      adminUser.contacts.includes(memberId)
    );

    if (validMembers.length === 0) {
      return res.status(400).json({ message: "No valid contacts to add." });
    }

    /** ✅ Proper fallback image and Cloudinary handling */
    let groupImageUrl = "/avatar.png"; // Local fallback (make sure frontend handles this fallback too)

    if (groupImage) {
      let formattedImage = groupImage;

      // Add prefix if missing (handle plain base64 string)
      if (!groupImage.startsWith("data:image")) {
        formattedImage = `data:image/png;base64,${groupImage}`;
      }

      const uploadResponse = await cloudinary.uploader.upload(formattedImage, {
        resource_type: "image",
      });
      groupImageUrl = uploadResponse.secure_url;
    }

    const newGroup = new Group({
      name,
      groupImage: groupImageUrl,
      admin: adminId,
      members: [adminId, ...validMembers],
    });

    await newGroup.save();

    /** ✅ Notify all members about group creation */
    newGroup.members.forEach((memberId) => {
      const socketId = getReceiverSocketId(memberId);
      if (socketId) {
        io.to(socketId).emit("groupCreated", newGroup);
      }
    });

    res.status(201).json({ message: "Group created successfully", group: newGroup });
  } catch (error) {
    console.error("Error creating group:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    const groups = await Group.find({ members: userId })
      .populate("admin", "fullName profilePic")
      .populate("members", "fullName profilePic")
      .lean();

    const groupsWithLastMessage = await Promise.all(
      groups.map(async (group) => {
        const lastMessage = await Message.findOne({ group: group._id })
          .sort({ createdAt: -1 })
          .lean();

        return {
          ...group,
          lastMessage: lastMessage || null,
          lastMessageTime: lastMessage ? lastMessage.createdAt : group.createdAt,  // ✅ This is important!
        };
      })
    );

    res.status(200).json(groupsWithLastMessage);
  } catch (error) {
    console.error("Error fetching groups with last message:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/** ✅ ADD MEMBER TO GROUP (Admin Only) */
export const addMemberToGroup = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { memberId } = req.body;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.admin.equals(userId)) {
      return res.status(403).json({ message: "Only admin can add members" });
    }

    if (group.members.includes(memberId)) {
      return res.status(400).json({ message: "User already in group" });
    }

    group.members.push(memberId);
    await group.save();

    const socketId = getReceiverSocketId(memberId);
    if (socketId) {
      io.to(socketId).emit("memberAdded", { groupId, memberId });
    }

    res.status(200).json({ message: "Member added successfully", group });
  } catch (error) {
    console.error("Error adding member:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/** ✅ REMOVE MEMBER FROM GROUP (Admin Only) */
export const removeMemberFromGroup = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { memberId } = req.body;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.admin.equals(userId)) {
      return res.status(403).json({ message: "Only admin can remove members" });
    }

    if (!group.members.includes(memberId)) {
      return res.status(400).json({ message: "User not in group" });
    }

    group.members = group.members.filter((id) => id.toString() !== memberId);
    await group.save();

    const socketId = getReceiverSocketId(memberId);
    if (socketId) {
      io.to(socketId).emit("memberRemoved", { groupId, memberId });
    }

    res.status(200).json({ message: "Member removed successfully", group });
  } catch (error) {
    console.error("Error removing member:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/** ✅ EXIT GROUP (Any Member) */
export const exitGroup = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!group.members.includes(userId)) {
      return res.status(400).json({ message: "You are not a member of this group" });
    }

    // Remove the user from the members list
    group.members = group.members.filter((id) => id.toString() !== userId);

    // Handle admin reassignment if the exiting user was the admin
    if (group.admin.equals(userId)) {
      if (group.members.length > 0) {
        group.admin = group.members[0]; // Assign the next member as admin
        const newAdminSocketId = getReceiverSocketId(group.admin);
        if (newAdminSocketId) {
          io.to(newAdminSocketId).emit("adminTransferred", {
            groupId,
            newAdminId: group.admin,
          });
        }
      } else {
        // If no members left, delete the group
        await Group.findByIdAndDelete(groupId);
        return res.status(200).json({ message: "Group deleted as no members left" });
      }
    }

    await group.save();

    // ✅ Emit 'memberExited' event to all remaining group members
    group.members.forEach((memberId) => {
      const socketId = getReceiverSocketId(memberId);
      if (socketId) {
        io.to(socketId).emit("memberExited", { groupId, memberId: userId });
      }
    });

    // ✅ Also notify the exiting user themselves
    const exitingSocketId = getReceiverSocketId(userId);
    if (exitingSocketId) {
      io.to(exitingSocketId).emit("memberExited", { groupId, memberId: userId });
    }

    res.status(200).json({ message: "Exited group successfully", group });
  } catch (error) {
    console.error("Error exiting group:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};


export const getSingleGroup = async (req, res) => {
  try {
    const groupId = req.params.groupId;

    const group = await Group.findById(groupId)
      .populate("admin", "fullName profilePic")
      .populate("members", "fullName profilePic");

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("Error fetching single group:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const changeGroupImage = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { groupImage } = req.body;

    if (!groupImage || !groupImage.startsWith("data:image")) {
      return res.status(400).json({ message: "Invalid image data" });
    }

    const uploadResponse = await cloudinary.uploader.upload(groupImage);
    const group = await Group.findByIdAndUpdate(
      groupId,
      { groupImage: uploadResponse.secure_url },
      { new: true }
    )
      .populate("admin", "fullName profilePic")
      .populate("members", "fullName profilePic");

    res.status(200).json(group);
  } catch (error) {
    console.error("Error changing group image:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const removeGroupImage = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const group = await Group.findByIdAndUpdate(
      groupId,
      { groupImage: "" },
      { new: true }
    )
      .populate("admin", "fullName profilePic")
      .populate("members", "fullName profilePic");

    res.status(200).json(group);
  } catch (error) {
    console.error("Error removing group image:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;

    // ✅ Validate if ID is a proper ObjectId
    if (!ObjectId.isValid(groupId)) {
      console.error("❌ Invalid group ID format:", id);
      return res.status(400).json({ message: "Invalid Group ID format" });
    }

    const userId = req.user._id;

    console.log("📥 [getGroupMessages] Fetching messages → GroupID:", groupId, "Requested by UserID:", userId);

    const group = await Group.findById(groupId);
    if (!group) {
      console.error("❌ [getGroupMessages] Group not found → GroupID:", groupId);
      return res.status(404).json({ message: "Group not found" });
    }

    if (!group.members.some((member) => member.toString() === userId.toString())) {
      console.warn("⚠️ [getGroupMessages] Unauthorized access attempt → UserID:", userId, "on GroupID:", groupId);
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const messages = await Message.find({ group: groupId })
      .sort({ createdAt: 1 })
      .populate("senderId", "fullName profilePic");

    console.log(`✅ [getGroupMessages] Messages fetched → Count: ${messages.length} for GroupID: ${groupId}`);

    res.status(200).json(messages);
  } catch (error) {
    console.error("🔥 [getGroupMessages] Error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      console.error("❌ Invalid group ID format:", id);
      return res.status(400).json({ message: "Invalid Group ID format" });
    }

    const groupId = new ObjectId(id);
    const senderId = req.user._id;

    console.log("📤 [sendGroupMessage] Sending → Text:", text, "Image:", image ? "[Image Attached]" : "No image", "GroupID:", groupId, "SenderID:", senderId);

    const group = await Group.findById(groupId);
    if (!group) {
      console.error("❌ [sendGroupMessage] Group not found → GroupID:", groupId);
      return res.status(404).json({ message: "Group not found" });
    }

    if (!group.members.some((member) => member.toString() === senderId.toString())) {
      console.warn("⚠️ [sendGroupMessage] Unauthorized send attempt → SenderID:", senderId, "on GroupID:", groupId);
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
      console.log("🖼️ [sendGroupMessage] Image uploaded successfully → URL:", imageUrl);
    }

    const newMessage = new Message({
      senderId,
      group: groupId,
      text,
      image: imageUrl,
    });

    await newMessage.save();
    const populatedMessage = await newMessage.populate("senderId", "fullName profilePic");

    console.log("✅ [sendGroupMessage] Message saved and populated → MessageID:", newMessage._id);

    io.to(groupId.toString()).emit("newMessage", populatedMessage); // Ensure groupId is string for Socket
    console.log("📡 [sendGroupMessage] Emitted 'newMessage' event to group room:", groupId);

    res.status(201).json(populatedMessage);
  } catch (error) {
  console.error("🔥 [sendGroupMessage] Error:", error);
  if (error.name === "ValidationError") {
    return res.status(400).json({ message: "Validation Error", error: error.message });
  }
  res.status(500).json({ message: "Internal server error", error: error.message });
}
};

/** ✅ Get Users NOT in Group */
export const getEligibleUsers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const existingMemberIds = group.members.map((id) => id.toString());
    const eligibleUsers = await User.find({
      _id: { $nin: existingMemberIds },
    }).select("_id fullName email profilePic");

    res.status(200).json(eligibleUsers);
  } catch (error) {
    res.status(500).json({ message: "Error fetching eligible users", error: error.message });
  }
};

/** ✅ Add Members to Group (Admin Only) */
export const addGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userIds } = req.body;
    const adminId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (group.admin.toString() !== adminId.toString()) {
      return res.status(403).json({ message: "Only the admin can add members" });
    }

    // Filter out already existing members
    const newMembers = userIds.filter(
      (userId) => !group.members.includes(userId)
    );

    group.members.push(...newMembers);
    await group.save();

    res.status(200).json({ message: "Members added successfully", addedMembers: newMembers });
  } catch (error) {
    res.status(500).json({ message: "Error adding members", error: error.message });
  }
};
