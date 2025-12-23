import React, { useEffect, useRef, useState } from "react";

/**
 * Props:
 *  - open, mode ("outgoing"|"incoming"|"active"), callType, user
 *  - onClose, onAnswer, onStartCall
 *  - localStream, remoteStream, callStartTime
 *  - isOutgoingPending (bool)
 *  - lastEndedAt (number | null) -> timestamp (ms) when last established call ended (optional)
 */

export default function CallModal({
  open,
  mode = "outgoing",
  callType = "video",
  user = null,
  onClose = () => {},
  onAnswer = () => {},
  onStartCall = () => {},
  localStream: propsLocalStream = null,
  remoteStream: propsRemoteStream = null,
  callStartTime = null,
  isOutgoingPending = false,
  lastEndedAt = null,
}) {
  const [localStream, setLocalStream] = useState(null);
  // internal remoteStream state to avoid ReferenceError and allow UI to hold stream
  const [remoteStream, setRemoteStream] = useState(null);

  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(callType === "video");
  const [mediaError, setMediaError] = useState(null);

  // call duration timer (seconds)
  const [callTime, setCallTime] = useState(0);
  const timerRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Placeholder control: show "Call ended" when modal reopened right after an established call ended.
  const [showCallEndedPlaceholder, setShowCallEndedPlaceholder] =
    useState(false);

  // threshold (ms) for considering lastEndedAt "recent"
  const RECENT_MS = 60 * 1000; // 60s

  // Start local media helper
  async function startLocalMedia({ audio = true, video = false } = {}) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video,
      });
      setLocalStream(stream);
      if (localVideoRef.current && video) {
        try {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          await localVideoRef.current.play().catch(() => {});
        } catch (e) {
          console.debug("startLocalMedia play failed:", e);
        }
      }
      setMediaError(null);
      return stream;
    } catch (err) {
      console.error("getUserMedia error:", err);
      setMediaError(
        err?.name === "NotAllowedError"
          ? "Microphone / camera permission denied. Please allow access in your browser."
          : "Unable to access media devices."
      );
      return null;
    }
  }

  function stopLocalMedia() {
    if (localStream) {
      try {
        localStream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      setLocalStream(null);
    }
  }

  useEffect(() => {
    if (!open) {
      stopLocalMedia();
      return;
    }

    if ((mode === "outgoing" || mode === "active") && callType === "video") {
      if (!propsLocalStream) startLocalMedia({ audio: true, video: true });
      setCameraOn(true);
    } else if (
      (mode === "outgoing" || mode === "active") &&
      callType === "voice"
    ) {
      if (!propsLocalStream) startLocalMedia({ audio: true, video: false });
      setCameraOn(false);
    }

    // If incoming and no external propsLocalStream available, start local preview automatically
    if (mode === "incoming" && callType === "video" && !propsLocalStream) {
      // start camera preview for callee by default
      startLocalMedia({ audio: true, video: true })
        .then((s) => {
          if (s) setCameraOn(true);
        })
        .catch(() => {});
    }

    return () => {
      if (!propsLocalStream) stopLocalMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, callType]);

  // Keep internal remoteStream state synced with incoming prop stream
  useEffect(() => {
    if (propsRemoteStream) {
      setRemoteStream(propsRemoteStream);
    } else {
      // we intentionally set null here — the UI will react to cleanup via hook signals
      setRemoteStream(null);
    }
  }, [propsRemoteStream]);

  // REPLACE the old attach-streams useEffect with this block
  useEffect(() => {
    // small helper: try to set srcObject and play, with safe guards
    async function setSrcAndPlay(elem, stream, mutedFlag = false) {
      if (!elem || !stream) return false;
      try {
        // only set if different to avoid redundant operations
        if (elem.srcObject !== stream) {
          console.debug("CallModal: setting video.srcObject ->", stream.id);
          elem.srcObject = stream;
        }
        elem.muted = mutedFlag;

        // try to play; many browsers will reject autoplay, but we still attempt
        await elem.play().catch((err) => {
          // not fatal — log for debugging
          console.debug("CallModal: play() rejected or blocked:", err);
        });

        return true;
      } catch (err) {
        console.warn("CallModal: setSrcAndPlay error:", err);
        try {
          elem.srcObject = stream;
        } catch (e) {
          /* swallow */
        }
        return false;
      }
    }

    // main attach flow: attempt immediately and retry a few times if necessary.
    // returns a cleanup function to remove listeners/timeouts
    function attachRemoteStreamWithRetries(elem, stream, mutedFlag = false) {
      if (!elem || !stream) return () => {};

      let cancelled = false;
      const timeouts = [];

      // ensure we log track state for debugging
      function logStreamTracks(prefix) {
        try {
          const tracks = stream.getTracks
            ? stream.getTracks().map((t) => `${t.kind}:${t.id}`)
            : [];
          console.log(
            `CallModal debug: ${prefix} stream.id=${stream.id} tracks=`,
            tracks
          );
        } catch (e) {
          /* ignore */
        }
      }

      // immediate attempt
      setSrcAndPlay(elem, stream, mutedFlag).then(() => {
        logStreamTracks("after immediate attach");
      });

      // retry schedule: short delays (250ms, 750ms, 1500ms)
      [250, 750, 1500].forEach((d) => {
        const t = setTimeout(() => {
          if (cancelled) return;
          setSrcAndPlay(elem, stream, mutedFlag).then(() => {
            logStreamTracks(`after retry ${d}ms`);
          });
        }, d);
        timeouts.push(t);
      });

      // if stream starts empty but gains tracks later, listen for addtrack
      const onAdd = () => {
        // short debounce
        setTimeout(() => {
          if (cancelled) return;
          try {
            console.log(
              "CallModal: stream 'addtrack' fired, reattaching to element"
            );
            if (elem.srcObject !== stream) elem.srcObject = stream;
            elem.muted = mutedFlag;
            elem.play().catch(() => {});
            logStreamTracks("after addtrack");
          } catch (e) {
            /* swallow */
          }
        }, 50);
      };

      try {
        if (stream.addEventListener) {
          stream.addEventListener("addtrack", onAdd);
        } else if (
          stream.onaddtrack === null ||
          typeof stream.onaddtrack !== "undefined"
        ) {
          // fallback to onaddtrack assignment if supported
          stream.onaddtrack = onAdd;
        }
      } catch (e) {
        console.warn(
          "CallModal: failed to attach stream.addEventListener(addtrack)",
          e
        );
      }

      // final cleanup
      return () => {
        cancelled = true;
        timeouts.forEach((t) => clearTimeout(t));
        try {
          if (stream.removeEventListener)
            stream.removeEventListener("addtrack", onAdd);
          if (stream.onaddtrack === onAdd) stream.onaddtrack = null;
        } catch (e) {}
      };
    }

    // prefer external prop local preview, otherwise internal localStream
    if (propsLocalStream && localVideoRef.current) {
      // we don't need a cleanup for local preview in this effect; handled elsewhere
      setSrcAndPlay(localVideoRef.current, propsLocalStream, true).catch(
        () => {}
      );
    } else if (localStream && localVideoRef.current) {
      setSrcAndPlay(localVideoRef.current, localStream, true).catch(() => {});
    }

    // remote stream attach — keep a persistent attachment behaviour
    const effectiveRemote = propsRemoteStream || remoteStream;
    let cleanupRemote = () => {};
    if (effectiveRemote && remoteVideoRef.current) {
      cleanupRemote = attachRemoteStreamWithRetries(
        remoteVideoRef.current,
        effectiveRemote,
        false
      );
    } else {
      // if no remote stream, ensure srcObject cleared (explicitly)
      try {
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
          remoteVideoRef.current.srcObject = null;
        }
      } catch (e) {}
    }

    // helpful debug prints every change so you can copy them when asking for more help
    console.debug(
      "CallModal: attach effect ran. propsRemoteStream.id:",
      propsRemoteStream?.id,
      "internal remoteStream.id:",
      remoteStream?.id
    );

    return () => {
      cleanupRemote();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsLocalStream, propsRemoteStream, localStream, remoteStream]);

  // Force attach when mode becomes active (new effect)
  useEffect(() => {
    // helper from earlier attach logic, re-declared small version
    async function setSrcAndPlay(elem, stream, mutedFlag = false) {
      if (!elem || !stream) return false;
      try {
        if (elem.srcObject !== stream) {
          console.debug(
            "CallModal (active attach): setting video.srcObject ->",
            stream.id
          );
          elem.srcObject = stream;
        }
        elem.muted = mutedFlag;
        await elem.play().catch((err) => {
          console.debug("CallModal (active attach) play rejected:", err);
        });
        return true;
      } catch (err) {
        console.warn("CallModal (active attach) setSrcAndPlay error:", err);
        try {
          elem.srcObject = stream;
        } catch (e) {
          /* swallow */
        }
        return false;
      }
    }

    // Only run when modal is open and mode is active (in-call)
    if (!open || mode !== "active") return;

    const localCandidate = propsLocalStream || localStream;
    const remoteCandidate = propsRemoteStream || remoteStream;

    // Force attach right away, then retry shortly after
    if (localCandidate && localVideoRef.current) {
      setSrcAndPlay(localVideoRef.current, localCandidate, true).catch(
        () => {}
      );
      setTimeout(
        () =>
          setSrcAndPlay(localVideoRef.current, localCandidate, true).catch(
            () => {}
          ),
        250
      );
    }
    if (remoteCandidate && remoteVideoRef.current) {
      setSrcAndPlay(remoteVideoRef.current, remoteCandidate, false).catch(
        () => {}
      );
      setTimeout(
        () =>
          setSrcAndPlay(remoteVideoRef.current, remoteCandidate, false).catch(
            () => {}
          ),
        250
      );
    }

    // Log track details for both streams for quick copy/paste debugging
    try {
      if (remoteCandidate && remoteCandidate.getTracks) {
        console.log(
          "CallModal debug (active): remoteCandidate tracks:",
          remoteCandidate.getTracks().map((t) => ({
            id: t.id,
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
          }))
        );
      } else {
        console.log("CallModal debug (active): remoteCandidate missing");
      }
      if (localCandidate && localCandidate.getTracks) {
        console.log(
          "CallModal debug (active): localCandidate tracks:",
          localCandidate.getTracks().map((t) => ({
            id: t.id,
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
          }))
        );
      } else {
        console.log("CallModal debug (active): localCandidate missing");
      }
    } catch (e) {
      console.warn("CallModal debug (active) track logging failed", e);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    mode,
    propsLocalStream,
    propsRemoteStream,
    localStream,
    remoteStream,
  ]);

  function toggleMute() {
    const s = propsLocalStream || localStream;
    if (!s) return;
    s.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMuted((m) => !m);
  }

  async function toggleCamera() {
    const s = propsLocalStream || localStream;
    if (!s && !cameraOn) {
      const started = await startLocalMedia({ audio: true, video: true });
      if (started) setCameraOn(true);
      return;
    }
    if (!s) return;
    s.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCameraOn((c) => !c);
  }

  async function handleStartCall() {
    try {
      setMediaError(null);
      await onStartCall();
      // user clicked Start Call -> clear "Call ended" placeholder immediately
      setShowCallEndedPlaceholder(false);
    } catch (err) {
      console.error("handleStartCall error:", err);
      if (err?.name === "NotAllowedError") {
        setMediaError(
          "Microphone / camera permission denied. Please allow access."
        );
      } else {
        setMediaError("Failed to access media devices or start call.");
      }
    }
  }

  async function handleAnswer() {
    try {
      setMediaError(null);
      if (callType === "video" && !propsLocalStream && !localStream) {
        const s = await startLocalMedia({ audio: true, video: true });
        if (!s) return;
      }
      await onAnswer();
    } catch (err) {
      console.error("handleAnswer error:", err);
      if (err?.name === "NotAllowedError") {
        setMediaError(
          "Microphone / camera permission denied. Please allow access."
        );
      } else {
        setMediaError("Failed to access media devices or answer call.");
      }
    }
  }

  function handleEnd() {
    if (!propsLocalStream) stopLocalMedia();
    onClose();
  }

  function inspectRemoteVideo() {
    console.log("remoteVideoRef.current:", remoteVideoRef.current);
    console.log(
      "remoteVideoRef.current.srcObject:",
      remoteVideoRef.current?.srcObject
    );
    console.log("propsRemoteStream:", propsRemoteStream);
    console.log("internal remoteStream:", remoteStream);
  }

  // Timer: use callStartTime as authoritative source if available
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (callStartTime) {
      const initialSeconds = Math.floor((Date.now() - callStartTime) / 1000);
      setCallTime(initialSeconds >= 0 ? initialSeconds : 0);

      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - callStartTime) / 1000);
        setCallTime(secs >= 0 ? secs : 0);
      }, 1000);
    } else {
      // legacy fallback: only run when truly active
      if (mode === "active") {
        setCallTime(0);
        timerRef.current = setInterval(() => {
          setCallTime((t) => t + 1);
        }, 1000);
      } else {
        setCallTime(0);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [callStartTime, mode, open]);

  useEffect(() => {
    // Show "Call ended" when:
    // - the modal is in outgoing (start-call) mode
    // - lastEndedAt is present and recent
    // NOTE: you asked to remove auto-clear timeout, so placeholder will stay until user acts.
    if (!open) {
      setShowCallEndedPlaceholder(false);
      return;
    }

    if (mode === "outgoing" && lastEndedAt) {
      const age = Date.now() - lastEndedAt;
      if (age >= 0 && age <= RECENT_MS) {
        setShowCallEndedPlaceholder(true);
        // DO NOT auto-clear (user must click)
        return;
      }
    }

    setShowCallEndedPlaceholder(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, lastEndedAt]);

  function formatTime(totalSeconds) {
    const mm = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const ss = (totalSeconds % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleEnd} />

      <div className="relative z-10 w-[92%] max-w-3xl rounded-xl bg-base-100 shadow-2xl overflow-hidden">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="avatar">
                <div className="w-14 h-14 rounded-full overflow-hidden">
                  <img
                    src={user?.profilePic || "/avatar.png"}
                    alt={user?.fullName || "User"}
                  />
                </div>
              </div>
              <div>
                <div className="font-semibold">
                  {user?.fullName || "Unknown"}
                </div>
                <div className="text-sm text-base-content/70">
                  {mode === "incoming" && "Incoming call"}
                  {mode === "outgoing" &&
                    (isOutgoingPending
                      ? "Calling..."
                      : showCallEndedPlaceholder
                      ? "Call ended"
                      : "Ready to call")}
                  {mode === "active" && "In call"}
                </div>
              </div>
            </div>

            <div className="text-sm text-base-content/60">
              {callType === "video" ? "Video" : "Voice"}
            </div>
          </div>

          {mediaError && (
            <div className="mt-3 p-2 rounded-md bg-red-50 text-red-700 border border-red-100">
              <div className="font-medium">Media error</div>
              <div className="text-sm">{mediaError}</div>
              <div className="text-xs mt-1 text-gray-500">
                Open site settings (padlock) to allow camera/mic.
              </div>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <div className="text-sm text-base-content/60">
              {mode === "active" ? `Duration: ${formatTime(callTime)}` : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col items-center justify-center rounded-lg border p-2">
              <div className="text-xs text-base-content/60 mb-2">You</div>
              {callType === "video" ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-48 md:h-56 rounded-md object-cover bg-black"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-24 rounded-md bg-base-200">
                  <span className="text-sm text-base-content/60">
                    Audio ready
                  </span>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button className="btn btn-sm" onClick={toggleMute}>
                  {muted ? "Unmute" : "Mute"}
                </button>
                {callType === "video" && (
                  <button className="btn btn-sm" onClick={toggleCamera}>
                    {cameraOn ? "Camera Off" : "Camera On"}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-lg border p-2">
              <div className="text-xs text-base-content/60 mb-2">
                {user?.fullName || "Remote"}
              </div>
              {callType === "video" ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-48 md:h-56 rounded-md object-cover bg-black"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-24 rounded-md bg-base-200">
                  <span className="text-sm text-base-content/60">
                    Remote audio
                  </span>
                </div>
              )}

              <div className="mt-3 text-sm text-base-content/60">
                Remote preview (connected streams will appear here)
              </div>

              <div className="mt-2">
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={inspectRemoteVideo}
                >
                  Inspect remote video
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4">
            {mode === "incoming" && (
              <>
                <button className="btn btn-success" onClick={handleAnswer}>
                  Answer
                </button>
                <button className="btn btn-error" onClick={handleEnd}>
                  Decline
                </button>
              </>
            )}

            {mode === "outgoing" && (
              <>
                <button className="btn btn-ghost" onClick={handleEnd}>
                  Cancel
                </button>

                {isOutgoingPending ? (
                  <button className="btn btn-error" onClick={handleEnd}>
                    End Call
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={handleStartCall}>
                    Start Call
                  </button>
                )}
              </>
            )}

            {mode === "active" && (
              <>
                <button className="btn btn-ghost" onClick={() => {}}>
                  Minimize
                </button>
                <button className="btn btn-error" onClick={handleEnd}>
                  End Call
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
