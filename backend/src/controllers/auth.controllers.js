import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";

/* ========================= SIGNUP ========================= */

export const signup = async (req, res) => {
    const { fullName, username, email, password } = req.body;

    try {
        // 🔴 BASIC VALIDATION
        if (!fullName || !username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password.length < 6) {
            return res
                .status(400)
                .json({ message: "Password must be at least 6 characters" });
        }

        // normalize username (telegram style)
        const normalizedUsername = username.toLowerCase().trim();

        // 🔴 CHECK EMAIL
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: "Email already exists" });
        }

        // 🔴 CHECK USERNAME
        const existingUsername = await User.findOne({
            username: normalizedUsername,
        });

        if (existingUsername) {
            return res.status(409).json({ message: "Username already taken" });
        }

        // 🔐 HASH PASSWORD
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // ✅ CREATE USER
        const newUser = new User({
            fullName,
            username: normalizedUsername,
            email,
            password: hashedPassword,
        });

        await newUser.save();

        // 🔐 JWT
        generateToken(newUser._id, res);

        res.status(201).json({
            _id: newUser._id,
            fullName: newUser.fullName,
            username: newUser.username,
            email: newUser.email,
            profilePic: newUser.profilePic,
        });
    } catch (error) {
        console.log("Error in signup controller:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/* ========================= LOGIN ========================= */

export const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isPasswordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        generateToken(user._id, res);

        res.status(200).json({
            _id: user._id,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            profilePic: user.profilePic,
        });
    } catch (error) {
        console.log("Error in login controller:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/* ========================= LOGOUT ========================= */

export const logout = (req, res) => {
    try {
        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        console.log("Error in logout controller:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/* ========================= UPDATE PROFILE ========================= */

export const updateProfile = async (req, res) => {
    try {
        const { profilePic } = req.body;
        const userId = req.user._id;

        if (!profilePic) {
            return res
                .status(400)
                .json({ message: "Profile pic is required" });
        }

        const uploadResponse = await cloudinary.uploader.upload(profilePic);

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { profilePic: uploadResponse.secure_url },
            { new: true }
        );

        res.status(200).json(updatedUser);
    } catch (error) {
        console.log("Error in update profile:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/* ========================= CHECK AUTH ========================= */

export const checkAuth = (req, res) => {
    try {
        res.status(200).json(req.user);
    } catch (error) {
        console.log("Error in checkAuth controller:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
