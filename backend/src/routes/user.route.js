import express from "express";
import { protectRoute } from "../middlewares/auth.middleware.js";
import {
    searchUsersByUsername,
    getChatContacts,
} from "../controllers/user.controller.js";

const router = express.Router();

router.get("/search", protectRoute, searchUsersByUsername);
router.get("/contacts", protectRoute, getChatContacts);

export default router;
