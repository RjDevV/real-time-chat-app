// src/components/ChatHeader.jsx
import { X, Phone, Video } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const ChatHeader = ({ onVoiceCall, onVideoCall }) => {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();

  // local fallback handlers that call props (and log)
  const handleVoiceCall = () => {
    console.log("ChatHeader: voice button clicked");
    if (onVoiceCall) onVoiceCall(selectedUser);
  };

  const handleVideoCall = () => {
    console.log("ChatHeader: video button clicked");
    if (onVideoCall) onVideoCall(selectedUser);
  };

  if (!selectedUser) {
    return (
      <div className="p-2.5 border-b border-base-300">
        <div className="flex items-center justify-between">
          <div>No chat selected</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img
                src={selectedUser.profilePic || "/avatar.png"}
                alt={selectedUser.fullName}
              />
            </div>
          </div>

          {/* User info */}
          <div>
            <h3 className="font-medium">{selectedUser.fullName}</h3>
            <p className="text-sm text-base-content/70">
              {onlineUsers.includes(selectedUser._id) ? "Online" : "Offline"}
            </p>
          </div>
        </div>

        {/* Right controls: voice, video, close */}
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleVoiceCall}
            aria-label="voice call"
            disabled={!selectedUser}
          >
            <Phone size={18} />
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={handleVideoCall}
            aria-label="video call"
            disabled={!selectedUser}
          >
            <Video size={18} />
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedUser(null)}
            aria-label="close chat"
          >
            <X />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;
