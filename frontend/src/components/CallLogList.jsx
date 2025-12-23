import { useEffect } from "react";
import { Phone, Video } from "lucide-react";
import { useCallStore } from "../store/useCallStore";
import { useAuthStore } from "../store/useAuthStore";

const timeAgo = (date) => {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);

  const intervals = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? "s" : ""} ago`;
    }
  }

  return "just now";
};

const CallLogList = () => {
  const { calls, fetchCalls, loading } = useCallStore();
  const { authUser } = useAuthStore();

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-400">Loading call history...</div>
    );
  }

  if (!calls.length) {
    return <div className="p-4 text-sm text-gray-400">No calls yet</div>;
  }

  return (
    <div className="flex flex-col divide-y divide-gray-700">
      {calls.map((call) => {
        const isCaller = call.caller.userId === authUser._id;
        const otherUser = isCaller ? call.callee : call.caller;

        const isMissed = call.status === "missed" && !isCaller;

        /* ---------------- STATUS TEXT ---------------- */
        let statusText = "Incoming";
        if (isCaller) statusText = "Outgoing";
        if (isMissed) statusText = "Missed";

        /* ---------------- ICON COLOR ---------------- */
        let iconColor = "text-green-400"; // incoming
        if (isCaller) iconColor = "text-blue-400"; // outgoing
        if (isMissed) iconColor = "text-red-500"; // missed

        const CallIcon = call.callType === "video" ? Video : Phone;

        return (
          <div
            key={call._id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800"
          >
            {/* Avatar */}
            <img
              src={otherUser.avatarUrl || "/avatar.png"}
              alt="avatar"
              className="w-10 h-10 rounded-full object-cover"
            />

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Name + Time */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-white truncate">
                  {otherUser.displayName || "Unknown"}
                </p>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {timeAgo(call.startTime)}
                </span>
              </div>

              {/* Status + Icon */}
              <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                <CallIcon className={`size-4 ${iconColor}`} />
                <span>{statusText}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CallLogList;
