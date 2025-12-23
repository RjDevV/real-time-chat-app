import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
            match: [/^[a-z0-9_]+$/, "Username can only contain letters, numbers, and underscores"],
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
            minlength: 6,
        },

        profilePic: {
            type: String,
            default: "",
        },

        about: {
            type: String,
            default: "",
        },

        contacts: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],

        lastSeen: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

const User = mongoose.model("User", userSchema);
export default User;
