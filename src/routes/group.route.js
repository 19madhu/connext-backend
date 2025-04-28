import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createGroup,
  getUserGroups,
  getSingleGroup,
  addMemberToGroup,
  removeMemberFromGroup,
  exitGroup,
  changeGroupImage,
  removeGroupImage,
  getGroupMessages,
  sendGroupMessage,
} from "../controllers/group.controller.js";
import { getEligibleUsers, addGroupMembers } from "../controllers/group.controller.js";

const router = express.Router();

// 🟢 Log Helper:
const logRouteAccess = (routeName) => (req, res, next) => {
  console.log(`✅ Route Hit: [${req.method}] ${req.originalUrl} → ${routeName}`);
  console.log("👉 Params:", req.params);
  console.log("👉 Query:", req.query);
  console.log("👉 Body:", req.body);
  console.log("👉 User (from token):", req.user?._id);
  next();
};

/**
 * @route   POST /api/groups
 * @desc    Create a new group (creator becomes admin)
 * @access  Private (Authenticated users only)
 */
router.post("/", protectRoute, logRouteAccess("Create Group"), createGroup);

/**
 * @route   GET /api/groups
 * @desc    Get all groups where the logged-in user is a member
 * @access  Private (Authenticated users only)
 */
router.get("/", protectRoute, logRouteAccess("Get User Groups"), getUserGroups);

/**
 * @route   PUT /api/groups/:groupId/add-member
 * @desc    Add a member to the group (admin only)
 * @access  Private (Authenticated users only)
 */
router.put("/:groupId/add-member", protectRoute, logRouteAccess("Add Member To Group"), addMemberToGroup);

/**
 * @route   PUT /api/groups/:groupId/remove-member
 * @desc    Remove a member from the group (admin only)
 * @access  Private (Authenticated users only)
 */
router.put("/:groupId/remove-member", protectRoute, logRouteAccess("Remove Member From Group"), removeMemberFromGroup);

/**
 * @route   GET /api/groups/:groupId
 * @desc    Get details of a single group
 * @access  Private (Authenticated users only)
 */
router.get("/:groupId", protectRoute, logRouteAccess("Get Single Group"), getSingleGroup);

/**
 * @route   PUT /api/groups/:groupId/change-image
 * @desc    Change group image (admin only)
 * @access  Private (Authenticated users only)
 */
router.put("/:groupId/change-image", protectRoute, logRouteAccess("Change Group Image"), changeGroupImage);

/**
 * @route   PUT /api/groups/:groupId/remove-image
 * @desc    Remove group image (admin only)
 * @access  Private (Authenticated users only)
 */
router.put("/:groupId/remove-image", protectRoute, logRouteAccess("Remove Group Image"), removeGroupImage);

/**
 * @route   GET /api/groups/messages/:groupId
 * @desc    Fetch messages of a group
 * @access  Private (Authenticated users only)
 */
router.get("/messages/:groupId", protectRoute, logRouteAccess("Get Group Messages"), getGroupMessages);

/**
 * @route   POST /api/groups/send-message/:id
 * @desc    Send a message in the group
 * @access  Private (Authenticated users only)
 */
router.post("/send-message/:id", protectRoute, logRouteAccess("Send Group Message"), sendGroupMessage);

router.get(
  "/:groupId/eligible-users",
  protectRoute,
  logRouteAccess("Get Eligible Users"),
  getEligibleUsers
);

// Add members to group
router.post(
  "/:groupId/add-members",
  protectRoute,
  logRouteAccess("Add Members to Group"),
  addGroupMembers
);

router.delete("/:groupId/exit", protectRoute, logRouteAccess("Exit Group"), exitGroup);
export default router;