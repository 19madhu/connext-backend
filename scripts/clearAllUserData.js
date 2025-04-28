import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../src/models/user.model.js";
import Message from "../src/models/message.model.js";
import cloudinary from "../src/lib/cloudinary.js";

// Load environment variables from backend/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  throw new Error("❌ MONGODB_URI is not defined in .env");
}

const clearAllUserData = async () => {
  try {
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected");

    const users = await User.find();

    for (const user of users) {
      if (user.profilePic) {
        // Extract public ID from Cloudinary image URL
        const match = user.profilePic.match(/\/upload\/(?:v\d+\/)?([^/.]+)/);
        if (match && match[1]) {
          const publicId = match[1];
          try {
            await cloudinary.uploader.destroy(publicId);
            console.log(`🗑️ Cloudinary image deleted: ${publicId}`);
          } catch (err) {
            console.error(`❌ Failed to delete Cloudinary image for ${user.fullName}`, err.message);
          }
        }
      }
    }

    await User.deleteMany({});
    console.log("✅ All users deleted");

    await Message.deleteMany({});
    console.log("✅ All messages deleted");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error clearing user data:", error.message);
    process.exit(1);
  }
};

clearAllUserData();