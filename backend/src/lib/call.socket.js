// backend/src/lib/call.socket.js
const CallLog = require("../models/call.model");

module.exports = function registerCallHandlers(io, socket) {
    // 1) CALL START (create log with status = missed by default)
    socket.on("call:start", async (data) => {
        try {
            // data = { roomId, callType, caller, callee }
            const call = await CallLog.create({
                roomId: data.roomId,
                callType: data.callType,
                caller: data.caller,
                callee: data.callee,
                startTime: new Date(),
                status: "missed" // will change to 'answered' if call is picked
            });

            // store callId on socket if needed
            socket.data.currentCallId = call._id;

            // Optionally emit to callee (but you probably already do this in your own flow)
            // io.to(`user_${data.callee.userId}`).emit("incoming-call", { ...data, callId: call._id });

        } catch (err) {
            console.error("call:start error", err);
        }
    });

    // 2) CALL JOINED (first person answered → status = answered)
    socket.on("call:joined", async ({ callId }) => {
        try {
            const call = await CallLog.findById(callId);
            if (!call) return;

            if (call.status !== "answered") {
                call.status = "answered";
                await call.save();

                // Notify caller + callee to update UI
                io.to(`user_${call.caller.userId}`).emit("call_log:updated", { callId });
                io.to(`user_${call.callee.userId}`).emit("call_log:updated", { callId });
            }
        } catch (err) {
            console.error("call:joined error", err);
        }
    });

    // 3) CALL END (finalize + broadcast)
    socket.on("call:end", async ({ callId }) => {
        try {
            const call = await CallLog.findById(callId);
            if (!call) return;

            call.endTime = new Date();
            await call.save();

            // Finally broadcast: a new call log is ready
            io.to(`user_${call.caller.userId}`).emit("call_log:created", call);
            io.to(`user_${call.callee.userId}`).emit("call_log:created", call);

        } catch (err) {
            console.error("call:end error", err);
        }
    });
};
