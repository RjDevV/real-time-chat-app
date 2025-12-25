import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";
import { Users, Phone, MessageCircle, Search } from "lucide-react";
import { axiosInstance } from "../lib/axios";

import CallLogList from "./CallLogList";
import useCall from "../hooks/useCall";

const Sidebar = () => {
  const {
    getContacts,
    contacts,
    selectedUser,
    setSelectedUser,
    isContactsLoading,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();

  const { authUser, onlineUsers } = useAuthStore();

  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("chats");

  const [searchInput, setSearchInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);

  // ✅ call hook (correct)
  const { callUser } = useCall({
    userId: authUser?._id,
  });

  const handleSearch = async () => {
    const username = searchInput.trim().toLowerCase();

    if (!username) return;

    // Prevent searching yourself
    if (username === authUser.username) {
      return;
    }

    setIsSearching(true);
    setSearchResult(null);

    try {
      const res = await axiosInstance.get(
        `/api/users/search?username=${username}`
      );

      const data = res.data;

      if (Array.isArray(data) && data.length === 1) {
        setSearchResult(data[0]);
      } else {
        setSearchResult(null);
      }
    } catch (err) {
      console.error("Search failed", err);
      setSearchResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    getContacts();
  }, [getContacts]);

  useEffect(() => {
    subscribeToMessages();

    return () => {
      unsubscribeFromMessages();
    };
  }, [subscribeToMessages, unsubscribeFromMessages]);

  const filteredUsers = showOnlineOnly
    ? contacts.filter((u) => onlineUsers.includes(u._id))
    : contacts;

  if (isContactsLoading) return <SidebarSkeleton />;

  return (
    <aside className="h-full w-20 lg:w-72 border-r border-base-300 flex flex-col transition-all duration-200">
      {/* ================= HEADER ================= */}
      <div className="border-b border-base-300 w-full p-5">
        <div className="flex items-center gap-2">
          <Users className="size-6" />
          <span className="font-medium hidden lg:block">Contacts</span>
        </div>

        {/* 🔍 SEARCH (STEP 1 UI ONLY) */}
        <div className="mt-3 hidden lg:flex items-center gap-2">
          <input
            type="text"
            placeholder="Search username"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="input input-bordered w-full"
          />
          <button className="btn btn-sm btn-ghost" onClick={handleSearch}>
            <Search className="size-4" />
          </button>
        </div>

        {/* Online filter */}
        <div className="mt-3 hidden lg:flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Show online only</span>
          </label>
          <span className="text-xs text-zinc-500">
            ({onlineUsers?.filter((id) => id !== authUser?._id).length ?? 0}{" "}
            online)
          </span>
        </div>
      </div>

      {/* ================= TABS ================= */}
      <div className="flex border-b border-base-300">
        <button
          onClick={() => setActiveTab("chats")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm ${
            activeTab === "chats"
              ? "text-white border-b-2 border-green-500"
              : "text-zinc-400"
          }`}
        >
          <MessageCircle className="size-5" />
          <span className="hidden lg:block">Chats</span>
        </button>

        <button
          onClick={() => setActiveTab("calls")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm ${
            activeTab === "calls"
              ? "text-white border-b-2 border-green-500"
              : "text-zinc-400"
          }`}
        >
          <Phone className="size-5" />
          <span className="hidden lg:block">Calls</span>
        </button>
      </div>

      {/* ================= CONTENT ================= */}
      <div className="overflow-y-auto w-full py-3 flex-1">
        {/* ----------- CHATS ----------- */}
        {activeTab === "chats" && (
          <>
            {/* ----------- CHAT / SEARCH STATES ----------- */}
            {searchInput ? (
              isSearching ? (
                <div className="p-4 text-sm text-zinc-500 text-center">
                  Searching...
                </div>
              ) : searchResult ? (
                <button
                  onClick={() => {
                    setSelectedUser(searchResult);
                    setSearchInput("");
                    setSearchResult(null);
                  }}
                  className="w-full p-3 flex items-center gap-3 hover:bg-base-300"
                >
                  <img
                    src={searchResult.profilePic || "/avatar.png"}
                    className="size-12 rounded-full"
                  />
                  <div className="text-left">
                    <div className="font-medium">{searchResult.fullName}</div>
                    <div className="text-sm text-zinc-400">
                      @{searchResult.username}
                    </div>
                  </div>
                </button>
              ) : (
                <div className="p-4 text-sm text-zinc-500 text-center">
                  No users found
                </div>
              )
            ) : contacts.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-zinc-500 px-4 text-center">
                Search users to start chatting
              </div>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user._id}
                  onClick={() => setSelectedUser(user)}
                  className={`
        w-full p-3 flex items-center gap-3
        hover:bg-base-300 transition-colors
        ${
          selectedUser?._id === user._id
            ? "bg-base-300 ring-1 ring-base-300"
            : ""
        }
      `}
                >
                  <div className="relative mx-auto lg:mx-0">
                    <img
                      src={user.profilePic || "/avatar.png"}
                      alt={user.fullName}
                      className="size-12 object-cover rounded-full"
                    />
                    {onlineUsers.includes(user._id) && (
                      <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-zinc-900" />
                    )}
                  </div>

                  <div className="hidden lg:block text-left min-w-0">
                    <div className="font-medium truncate">{user.fullName}</div>
                    <div className="text-sm text-zinc-400">
                      {onlineUsers.includes(user._id) ? "Online" : "Offline"}
                    </div>
                  </div>
                </button>
              ))
            )}
          </>
        )}

        {/* ----------- CALL LOGS ----------- */}
        {activeTab === "calls" && (
          <CallLogList
            onCallAgain={(userSnapshot, callType) => {
              if (!authUser?._id || !userSnapshot?.userId) return;

              const realUser = contacts.find(
                (u) => u._id === userSnapshot.userId
              );

              if (realUser) {
                setSelectedUser(realUser);
              }

              callUser(userSnapshot.userId, callType);
            }}
          />
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
