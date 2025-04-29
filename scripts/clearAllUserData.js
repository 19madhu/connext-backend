import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../src/models/user.model.js";
import Message from "../src/models/message.model.js";
import Group from "../src/models/group.model.js";
import cloudinary from "../src/lib/cloudinary.js";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  throw new Error("❌ MONGODB_URI is not defined in .env");
}

const clearAllData = async () => {
  try {
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected");

    // ========================
    // DELETE ALL User Images from Cloudinary (INCLUDING avatar.png)
    // ========================
    const users = await User.find();
    for (const user of users) {
      if (user.profilePic) {
        const match = user.profilePic.match(/\/upload\/(?:v\d+\/)?([^/.]+)/);
        if (match && match[1]) {
          const publicId = match[1];
          try {
            await cloudinary.uploader.destroy(publicId, { invalidate: true });
            console.log(`🗑️ Deleted user image: ${publicId}`);
          } catch (err) {
            console.error(`❌ Failed to delete User image for ${user.fullName}`, err.message);
          }
        }
      }
    }

    // ========================
    // DELETE ALL Group Images from Cloudinary (INCLUDING avatar.png)
    // ========================
    const groups = await Group.find();
    for (const group of groups) {
      if (group.groupImage) {
        const match = group.groupImage.match(/\/upload\/(?:v\d+\/)?([^/.]+)/);
        if (match && match[1]) {
          const publicId = match[1];
          try {
            await cloudinary.uploader.destroy(publicId, { invalidate: true });
            console.log(`🗑️ Deleted group image: ${publicId}`);
          } catch (err) {
            console.error(`❌ Failed to delete Group image for ${group.name}`, err.message);
          }
        }
      }
    }

    // ========================
    // DELETE ALL MongoDB Documents
    // ========================
    await User.deleteMany({});
    console.log("✅ All users deleted");

    await Message.deleteMany({});
    console.log("✅ All messages deleted");

    await Group.deleteMany({});
    console.log("✅ All groups deleted");

    console.log("🔥 Total destruction completed successfully!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during complete data wipe:", error.message);
    process.exit(1);
  }
};

clearAllData();