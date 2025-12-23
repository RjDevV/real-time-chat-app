// backend/src/lib/socket.js
import { Server } from "socket.io";
import http from "http";
import express from "express";
import CallLog from "../models/call.model.js";
import User from "../models/user.model.js"; // ✅ NEW

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL,
        credentials: true,
    },
});

/**
 * userId -> Set<socketId>
 */
const userSocketMap = {};

/**
 * callId -> {
 *   caller,
 *   callee,
 *   callType,
 *   startedAt,
 *   answered
 * }
 */
const activeCalls = new Map();

/* =========================
   HELPERS
========================= */

export function getReceiverSocketIds(userId) {
    const s = userSocketMap[userId];
    if (!s) return [];
    return Array.from(s);
}

export function getReceiverSocketId(userId) {
    const ids = getReceiverSocketIds(userId);
    return ids.length > 0 ? ids[0] : undefined;
}

/* =========================
   SOCKET CONNECTION
========================= */

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    const userId = socket.handshake.query?.userId;
    console.log("handshake userId:", userId);

    if (userId) {
        const roomName = `user:${userId}`;
        socket.join(roomName);

        if (!userSocketMap[userId]) userSocketMap[userId] = new Set();
        userSocketMap[userId].add(socket.id);

        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }

    /* =========================
       CALL SIGNALING + LOGS
    ========================= */

    /**
     * CALL INITIATED
     */
    socket.on("call-user", ({ to, offer, callType, callId }) => {
        activeCalls.set(callId, {
            caller: userId,
            callee: to,
            callType,
            startedAt: new Date(),
            answered: false,
        });

        io.to(`user:${to}`).emit("incoming-call", {
            from: userId,
            offer,
            callType,
            callId,
        });
    });

    /**
     * CALL ANSWERED
     */
    socket.on("make-answer", ({ to, answer, callId }) => {
        const call = activeCalls.get(callId);
        if (call) call.answered = true;

        io.to(`user:${to}`).emit("call-answered", {
            from: userId,
            answer,
            callId,
        });
    });

    /**
     * ICE CANDIDATES
     */
    socket.on("ice-candidate", ({ to, candidate, callId }) => {
        io.to(`user:${to}`).emit("ice-candidate", {
            from: userId,
            candidate,
            callId,
        });
    });

    /**
     * CALL STARTED (UI sync only)
     */
    socket.on("call-started", ({ to, startedAt, callId }) => {
        io.to(`user:${to}`).emit("call-started", {
            from: userId,
            startedAt,
            callId,
        });
    });

    /**
     * CALL ENDED / MISSED
     */
    socket.on("end-call", async ({ to, callId }) => {
        try {
            const call = activeCalls.get(callId);
            if (!call) return;

            // normalize enums
            const normalizedCallType =
                call.callType === "voice" ? "audio" : call.callType;

            const status = call.answered ? "answered" : "missed";

            // ✅ FETCH CORRECT USER FIELDS
            const [callerUser, calleeUser] = await Promise.all([
                User.findById(call.caller).select("fullName profilePic"),
                User.findById(call.callee).select("fullName profilePic"),
            ]);

            if (!callerUser || !calleeUser) {
                console.warn("CallLog creation skipped: user not found");
                return;
            }

            // ✅ SAVE SNAPSHOT (WhatsApp-style)
            const callLog = await CallLog.create({
                caller: {
                    userId: callerUser._id,
                    displayName: callerUser.fullName,   // ✅ FIXED
                    avatarUrl: callerUser.profilePic,   // ✅ FIXED
                },
                callee: {
                    userId: calleeUser._id,
                    displayName: calleeUser.fullName,   // ✅ FIXED
                    avatarUrl: calleeUser.profilePic,   // ✅ FIXED
                },
                callType: normalizedCallType,
                status,
                startTime: call.startedAt,
                endTime: new Date(),
            });

            // 🔥 REAL-TIME UPDATE
            io.to(`user:${call.caller}`).emit("call_log:created", callLog);
            io.to(`user:${call.callee}`).emit("call_log:created", callLog);

            activeCalls.delete(callId);

            io.to(`user:${to}`).emit("call-ended", { callId });
        } catch (err) {
            console.warn("Failed to create call log:", err);
        }
    });




    /* =========================
       DISCONNECT
    ========================= */

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id, "userId:", userId);

        if (userId && userSocketMap[userId]) {
            userSocketMap[userId].delete(socket.id);
            if (userSocketMap[userId].size === 0) {
                delete userSocketMap[userId];
            }
        }

        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
});

export { io, app, server };
