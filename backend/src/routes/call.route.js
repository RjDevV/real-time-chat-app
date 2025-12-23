import express from "express";
import CallLog from "../models/call.model.js";
import { protectRoute } from "../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * GET /api/calls
 * Returns call logs for logged-in user
 */
router.get("/", protectRoute, async (req, res) => {
    try {
        const userId = req.user._id;

        const calls = await CallLog.find({
            $or: [
                { "caller.userId": userId },
                { "callee.userId": userId },
            ],
        })
            .sort({ startTime: -1 })
            .limit(50)
            .lean();

        res.status(200).json({
            success: true,
            calls,
        });
    } catch (error) {
        console.error("GET /api/calls error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch call logs",
        });
    }
});

export default router;
