import Group from "../models/group.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

/** ✅ Stored Procedure: Add Members to Group */
export const addGroupMembersService = async (groupId, userIds, adminId) => {
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");

  if (group.admin.toString() !== adminId.toString()) {
    throw new Error("Only admin can add members");
  }

  const newMembers = userIds.filter((userId) => !group.members.includes(userId));
  group.members.push(...newMembers);
  await group.save();

  return { message: "Members added successfully", addedMembers: newMembers };
};

/** ✅ Stored Procedure: Remove Member from Group */
export const removeGroupMemberService = async (groupId, memberId, adminId) => {
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");

  if (group.admin.toString() !== adminId.toString()) {
    throw new Error("Only admin can remove members");
  }

  group.members = group.members.filter((id) => id.toString() !== memberId);
  await group.save();

  const socketId = getReceiverSocketId(memberId);
  if (socketId) {
    io.to(socketId).emit("memberRemoved", { groupId, memberId });
  }

  return { message: "Member removed successfully" };
};

/** ✅ Stored Procedure: Exit Group (Any Member) */
export const exitGroupService = async (groupId, userId) => {
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");

  group.members = group.members.filter((id) => id.toString() !== userId);

  if (group.admin.equals(userId)) {
    if (group.members.length > 0) {
      group.admin = group.members[0];
      const newAdminSocketId = getReceiverSocketId(group.admin);
      if (newAdminSocketId) {
        io.to(newAdminSocketId).emit("adminTransferred", { groupId, newAdminId: group.admin });
      }
    } else {
      await Group.findByIdAndDelete(groupId);
      return { message: "Group deleted as no members left" };
    }
  }

  await group.save();
  return { message: "Exited group successfully" };
};