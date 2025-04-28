import express from "express";
import { searchUsers } from "../controllers/user.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
    blockUser,
    unblockUser,
    getBlockedUsers,
  } from "../controllers/user.controller.js";

const router = express.Router();

router.get("/search", protectRoute, searchUsers);

// ✅ Block a user
router.post("/block/:userId", protectRoute, blockUser);

// ✅ Unblock a user
router.post("/unblock/:userId", protectRoute, unblockUser);

// ✅ Get blocked users list
router.get("/blocked", protectRoute, getBlockedUsers);

export default router;