import { create } from "zustand";
import { axiosInstance } from "../lib/axios";

export const useCallStore = create((set) => ({
    calls: [],
    loading: false,

    fetchCalls: async () => {
        try {
            set({ loading: true });
            const res = await axiosInstance.get("/api/calls");

            set((state) => ({
                calls: [
                    ...res.data.calls.filter(
                        (call) => !state.calls.some((c) => c._id === call._id)
                    ),
                    ...state.calls,
                ],
                loading: false,
            }));
        } catch (error) {
            console.error("Failed to fetch call logs", error);
            set({ loading: false });
        }
    },

    addCall: (call) =>
        set((state) => {
            const exists = state.calls.some((c) => c._id === call._id);
            if (exists) return state;
            return { calls: [call, ...state.calls] };
        }),

    updateCall: (callId, updatedData) =>
        set((state) => ({
            calls: state.calls.map((c) =>
                c._id === callId ? { ...c, ...updatedData } : c
            ),
        })),
}));
