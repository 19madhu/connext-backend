import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getMessages, getUsersWithLastMessage, sendMessage } from "../controllers/message.controller.js";


const router = express.Router();

router.get("/users-with-last-message", protectRoute, getUsersWithLastMessage);
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);


export default router;
