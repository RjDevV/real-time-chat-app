import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
    messages: [],

    // ❌ OLD (keep for now, not used in sidebar anymore)
    users: [],

    // ✅ NEW — contacts (users you already chatted with)
    contacts: [],

    selectedUser: null,

    isUsersLoading: false,
    isContactsLoading: false,
    isMessagesLoading: false,

    // ❌ OLD — keep but sidebar will stop using this
    getUsers: async () => {
        set({ isUsersLoading: true });
        try {
            const res = await axiosInstance.get("/api/messages/users");
            set({ users: res.data });
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load users");
        } finally {
            set({ isUsersLoading: false });
        }
    },

    // ✅ NEW — fetch contacts based on chat history
    getContacts: async () => {
        set({ isContactsLoading: true });
        try {
            const res = await axiosInstance.get("/api/users/contacts");
            set({ contacts: res.data });
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load contacts");
            set({ contacts: [] });
        } finally {
            set({ isContactsLoading: false });
        }
    },

    getMessages: async (userId) => {
        set({ isMessagesLoading: true });
        try {
            const res = await axiosInstance.get(`/api/messages/${userId}`);
            set({ messages: res.data });
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load messages");
        } finally {
            set({ isMessagesLoading: false });
        }
    },

    sendMessage: async (messageData) => {
        const { selectedUser, messages, contacts } = get();

        try {
            const res = await axiosInstance.post(
                `/api/messages/send/${selectedUser._id}`,
                messageData
            );

            // 1️⃣ Add message to chat
            set({ messages: [...messages, res.data] });

            // 2️⃣ Move contact to top (SENDER SIDE FIX)
            const updatedContacts = [
                selectedUser,
                ...contacts.filter((c) => c._id !== selectedUser._id),
            ];

            set({ contacts: updatedContacts });
        } catch (error) {
            toast.error(
                error.response?.data?.message || "Failed to send message"
            );
        }
    },



    subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;

        socket.on("newMessage", (newMessage) => {
            const { selectedUser, messages, contacts } = get();
            const authUser = useAuthStore.getState().authUser;

            // Identify the other user in this message
            const otherUserId =
                newMessage.senderId === authUser._id
                    ? newMessage.receiverId
                    : newMessage.senderId;

            /* -----------------------------------------
               1️⃣ PREVENT DUPLICATE MESSAGES (CRITICAL)
            ------------------------------------------*/
            const alreadyExists = messages.some(
                (msg) => msg._id === newMessage._id
            );
            if (alreadyExists) return;

            /* -----------------------------------------
               2️⃣ APPEND MESSAGE IF CHAT IS OPEN
            ------------------------------------------*/
            if (selectedUser && selectedUser._id === otherUserId) {
                set({ messages: [...messages, newMessage] });
            }

            /* -----------------------------------------
               3️⃣ MOVE CONTACT TO TOP (SEND + RECEIVE)
            ------------------------------------------*/
            const existingIndex = contacts.findIndex(
                (c) => c._id === otherUserId
            );

            let updatedContacts = [...contacts];

            if (existingIndex !== -1) {
                const [contact] = updatedContacts.splice(existingIndex, 1);
                updatedContacts.unshift(contact);
            }
            // ⚠️ Do NOT create fake contact objects here
            // New contacts should come from /users/contacts on refresh

            set({ contacts: updatedContacts });
        });
    },




    unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket.off("newMessage");
    },

    setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
