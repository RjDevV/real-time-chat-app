// src/components/ChatContainer.jsx
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useEffect, useRef, useState } from "react";

import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { formatMessageTime } from "../lib/utils";

import CallModal from "./CallModal";

const ChatContainer = ({ call }) => {
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();

  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);

  // Modal State
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callMode, setCallMode] = useState("outgoing"); // "incoming" | "outgoing" | "active"
  const [callType, setCallType] = useState("video");

  const userId = authUser?._id;

  // track previous outgoing to detect decline vs cancel
  const prevOutgoingRef = useRef(false);
  // track previous "active" (inCall || callStartTime) to detect end-of-established-call
  const prevActiveRef = useRef(false);

  // user intentionally closed (caller cancelled) — ignore automatic reopen (except for established-call end)
  const userClosedRef = useRef(false);
  // user manually opened modal by clicking call icon — prevents the auto-close race
  const manualOpenRef = useRef(false);

  // Fetch messages
  useEffect(() => {
    if (!selectedUser?._id) return;
    getMessages(selectedUser._id);
    subscribeToMessages();

    return () => unsubscribeFromMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?._id]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // 1) Open modal on incoming call (remote triggered)
  useEffect(() => {
    if (call?.incomingCall) {
      const { callType: incomingType } = call.incomingCall;
      setCallType(incomingType || "video");
      setCallMode("incoming");
      setCallModalOpen(true);
      userClosedRef.current = false;
      manualOpenRef.current = false; // incoming means UI wasn't manually opened by user
    }
  }, [call?.incomingCall]);

  // 2) When caller initiates (outgoing pending) — show modal with End Call button
  useEffect(() => {
    if (call?.outgoing) {
      // caller started call or is waiting
      setCallModalOpen(true);
      setCallMode("outgoing");
      userClosedRef.current = false;
      manualOpenRef.current = false; // outgoing is authoritative
    }

    // Detect transition: previously outgoing -> now not outgoing and not inCall and not incoming.
    // That often means remote declined the call (callee ended) — reopen modal to allow retry.
    if (
      prevOutgoingRef.current === true &&
      !call?.outgoing &&
      !call?.inCall &&
      !call?.incomingCall
    ) {
      if (!userClosedRef.current) {
        setCallModalOpen(true);
        setCallMode("outgoing");
        manualOpenRef.current = false;
      }
    }

    prevOutgoingRef.current = !!call?.outgoing;
  }, [call?.outgoing, call?.inCall, call?.incomingCall]);

  // 3) When call becomes active (inCall or callStartTime)
  useEffect(() => {
    if (call?.inCall || call?.callStartTime) {
      setCallModalOpen(true);
      setCallMode("active");
      userClosedRef.current = false;
      manualOpenRef.current = false;
    }
  }, [call?.inCall, call?.callStartTime]);

  // 4) Detect end of an established call (active -> not active) and reopen Start-Call modal.
  //    IMPORTANT: this ALWAYS reopens Start-Call modal when an established call ends (per your requirement).
  useEffect(() => {
    // current active state: either a connection established flag or an authoritative start timestamp
    const currentlyActive = !!(call?.inCall || call?.callStartTime);
    const previouslyActive = prevActiveRef.current;

    if (previouslyActive && !currentlyActive) {
      // an established call ended — reopen Start-Call modal for both peers.
      setCallModalOpen(true);
      setCallMode("outgoing");
      // mark it as manual/intentional so the "auto-close when no call" effect doesn't immediately hide it
      manualOpenRef.current = true;
      // clear the userClosed flag because this is a finished call (not a pre-answer cancel)
      userClosedRef.current = false;
    }

    prevActiveRef.current = currentlyActive;
  }, [call?.inCall, call?.callStartTime]);

  // 5) Watch lastEndedAt — authoritative signal from hook that a call was cleaned up.
  //    If lastEndedAt changed and the call was previously active, reopen Start-Call modal.
  useEffect(() => {
    if (!call) return;
    if (!("lastEndedAt" in call)) return;

    const t = call.lastEndedAt;
    if (!t) return;

    // If UI was previously active (established call), we want Start-Call modal to appear.
    // (In case a race left previous boolean checks missed.)
    const prevActive = prevActiveRef.current;
    if (prevActive) {
      setCallModalOpen(true);
      setCallMode("outgoing");
      manualOpenRef.current = true; // keep it open
      userClosedRef.current = false;
    } else {
      // If it wasn't active (was a pre-answer cancel), respect userClosedRef behavior:
      if (!userClosedRef.current && !manualOpenRef.current) {
        setCallModalOpen(true);
        setCallMode("outgoing");
      }
    }
  }, [call?.lastEndedAt]);

  // 6) Close modal when there's no incoming/outgoing/active call (callee/caller ended)
  //    But do not auto-close if the user manually opened the modal just now (prevent race).
  useEffect(() => {
    const hasAnyCall = !!(
      call?.incomingCall ||
      call?.outgoing ||
      call?.inCall ||
      call?.callStartTime
    );

    if (!hasAnyCall) {
      // If the user manually opened the modal (clicking call button) or we intentionally reopened after
      // an established-call end (manualOpenRef true) we should NOT auto-close — allow the user to hit
      // "Start Call" or Cancel.
      if (!manualOpenRef.current) {
        if (callModalOpen) {
          setCallModalOpen(false);
          setCallMode("outgoing");
        }
        userClosedRef.current = false;
      } else {
        // manualOpenRef true and no call state (user opened modal but hook hasn't set outgoing yet),
        // or we intentionally reopened after finished call: keep the modal open.
      }
    }
    // We only need to watch these specific flags
  }, [
    call?.incomingCall,
    call?.outgoing,
    call?.inCall,
    call?.callStartTime,
    callModalOpen,
  ]);

  // --- Call Button Handlers ---
  function onVoiceCallClick() {
    setCallType("voice");
    setCallMode("outgoing");
    setCallModalOpen(true);
    userClosedRef.current = false;
    manualOpenRef.current = true; // user intentionally opened
  }

  function onVideoCallClick() {
    setCallType("video");
    setCallMode("outgoing");
    setCallModalOpen(true);
    userClosedRef.current = false;
    manualOpenRef.current = true; // user intentionally opened
  }

  // When caller presses Start Call
  async function handleStartCall() {
    if (!selectedUser) return;
    try {
      // hook will set call.outgoing = true
      await call.callUser(selectedUser._id, callType);
      // keep modal open and mode "outgoing" — the hook's outgoing flag drives "End Call" button
      setCallModalOpen(true);
      setCallMode("outgoing");
      userClosedRef.current = false;
      // outgoing from the hook is authoritative now (clear manualOpen)
      manualOpenRef.current = false;
    } catch (err) {
      console.error("callUser error:", err);
      // keep manualOpenRef true so user can retry
    }
  }

  // When callee answers call
  async function handleAnswer() {
    try {
      await call.answerCall();
      // optimistically set active; hook will confirm via call-started
      setCallMode("active");
      setCallModalOpen(true);
      userClosedRef.current = false;
      manualOpenRef.current = false;
    } catch (err) {
      console.error("answer error:", err);
    }
  }

  // End Call (both sides). This is user-initiated close.
  function handleClose() {
    // mark that user intentionally closed (so incoming effect won't reopen)
    userClosedRef.current = true;
    // notify peer & cleanup via hook
    call.endCall(selectedUser?._id);
    // close UI
    setCallModalOpen(false);
    setCallMode("outgoing");
    manualOpenRef.current = false;
  }

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader
          onVoiceCall={() => onVoiceCallClick(selectedUser)}
          onVideoCall={() => onVideoCallClick(selectedUser)}
        />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <ChatHeader
        onVoiceCall={() => onVoiceCallClick(selectedUser)}
        onVideoCall={() => onVideoCallClick(selectedUser)}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message._id}
            className={`chat ${
              message.senderId === authUser._id ? "chat-end" : "chat-start"
            }`}
            ref={messageEndRef}
          >
            <div className="chat-image avatar">
              <div className="size-10 rounded-full border">
                <img
                  src={
                    message.senderId === authUser._id
                      ? authUser.profilePic || "/avatar.png"
                      : selectedUser?.profilePic || "/avatar.png"
                  }
                  alt="profile"
                />
              </div>
            </div>

            <div className="chat-header mb-1">
              <time className="text-xs opacity-50 ml-1">
                {formatMessageTime(message.createdAt)}
              </time>
            </div>

            <div
              className={`chat-bubble flex flex-col ${
                message.senderId === authUser._id
                  ? "bg-primary text-primary-content"
                  : "bg-base-200 text-base-content"
              }`}
            >
              {message.image && (
                <img
                  src={message.image}
                  className="sm:max-w-[200px] rounded-md mb-2"
                  alt="attachment"
                />
              )}
              {message.text}
            </div>
          </div>
        ))}
      </div>

      <MessageInput />

      <CallModal
        open={callModalOpen}
        mode={callMode}
        callType={callType}
        user={selectedUser}
        onStartCall={handleStartCall}
        onAnswer={handleAnswer}
        onClose={handleClose}
        localStream={call?.localStream}
        remoteStream={call?.remoteStream}
        callStartTime={call?.callStartTime}
        isOutgoingPending={!!call?.outgoing}
      />
    </div>
  );
};

export default ChatContainer;
