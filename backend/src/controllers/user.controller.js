import User from "../models/user.model.js";
import Message from "../models/message.model.js";

/**
 * GET /api/users/search?username=ran
 * Exact username search (frontend enforces exact match)
 */
export const searchUsersByUsername = async (req, res) => {
    try {
        const { username } = req.query;
        const currentUserId = req.user._id;

        if (!username || username.trim().length < 1) {
            return res.status(400).json({ message: "Username is required" });
        }

        const user = await User.findOne({
            username: username.toLowerCase(),
            _id: { $ne: currentUserId }, // exclude self
        }).select("_id fullName username profilePic");

        if (!user) {
            return res.status(200).json([]);
        }

        res.status(200).json([user]);
    } catch (error) {
        console.log("Error in searchUsersByUsername:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * GET /api/users/contacts
 * Returns users the logged-in user has chatted with
 */
export const getChatContacts = async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // 🔥 1. Get all messages involving logged-in user
        // 🔥 2. Sort by latest message first
        const messages = await Message.find({
            $or: [{ senderId: userId }, { receiverId: userId }],
        })
            .sort({ createdAt: -1 }) // ✅ MOST IMPORTANT
            .select("senderId receiverId createdAt");

        // Map to preserve order + last message time
        const contactLastMessageMap = new Map();

        messages.forEach((msg) => {
            const senderId = msg.senderId.toString();
            const receiverId = msg.receiverId.toString();

            const contactId = senderId === userId ? receiverId : senderId;

            // First occurrence = latest message (because sorted desc)
            if (!contactLastMessageMap.has(contactId)) {
                contactLastMessageMap.set(contactId, msg.createdAt);
            }
        });

        if (contactLastMessageMap.size === 0) {
            return res.status(200).json([]);
        }

        // Fetch user details
        const contacts = await User.find({
            _id: { $in: Array.from(contactLastMessageMap.keys()) },
        }).select("_id fullName username profilePic");

        // 🔥 Sort contacts based on last message time
        const sortedContacts = contacts.sort(
            (a, b) =>
                new Date(contactLastMessageMap.get(b._id.toString())) -
                new Date(contactLastMessageMap.get(a._id.toString()))
        );

        res.status(200).json(sortedContacts);
    } catch (error) {
        console.error("Error in getChatContacts:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

