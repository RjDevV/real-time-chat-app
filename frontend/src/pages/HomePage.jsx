// src/pages/HomePage.jsx
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import useCall from "../hooks/useCall";

import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedUser } = useChatStore();
  const { authUser } = useAuthStore();
  const userId = authUser?._id || null;

  // IMPORTANT: This is the ONLY useCall hook in the entire app!
  const call = useCall({ token: null, userId });

  return (
    <div className="h-screen bg-base-200">
      <div className="flex items-center justify-center pt-20 px-4">
        <div className="bg-base-100 rounded-lg shadow-cl w-full max-w-6xl h-[calc(100vh-8rem)]">
          <div className="flex h-full rounded-lg overflow-hidden">
            <Sidebar />

            {!selectedUser ? <NoChatSelected /> : <ChatContainer call={call} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
