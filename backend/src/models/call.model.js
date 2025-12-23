import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
    {
        caller: {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            displayName: String,
            avatarUrl: String,
        },

        callee: {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            displayName: String,
            avatarUrl: String,
        },

        callType: {
            type: String,
            enum: ["audio", "video"],
            required: true,
        },

        startTime: {
            type: Date,
            default: Date.now,
        },

        endTime: {
            type: Date,
        },

        duration: {
            type: Number, // seconds
        },
    },
    { timestamps: true }
);

const CallLog = mongoose.model("CallLog", callSchema);
export default CallLog;
