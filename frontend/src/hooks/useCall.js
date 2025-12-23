import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

function makeCallId(callerId) {
    return `${callerId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function useCall({ token = null, userId = null } = {}) {
    const socketRef = useRef(null);
    const pcRef = useRef(null);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);

    const [incomingCall, setIncomingCall] = useState(null);
    const [outgoing, setOutgoing] = useState(false);
    const [inCall, setInCall] = useState(false);
    const [callStartTime, setCallStartTime] = useState(null);
    const [lastEndedAt, setLastEndedAt] = useState(null);

    const activeCallIdRef = useRef(null);
    const callStartedRef = useRef(false);
    const pendingEndedCallIdsRef = useRef(new Set());

    const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    useEffect(() => {
        if (!userId) return;

        socketRef.current = io(SOCKET_SERVER_URL, { query: { userId } });

        socketRef.current.on("connect", () => {
            console.log("useCall: socket connected", socketRef.current.id, "for userId:", userId);
        });

        socketRef.current.on("connect_error", (err) => {
            console.error("useCall socket connect_error:", err?.message || err);
        });

        socketRef.current.on("incoming-call", ({ from, offer, callType, callId }) => {
            console.log("useCall: incoming-call from", from, "callType:", callType, "callId:", callId);
            if (callId && pendingEndedCallIdsRef.current.has(callId)) {
                console.log("useCall: ignoring incoming-call because callId is in pendingEnded:", callId);
                pendingEndedCallIdsRef.current.delete(callId);
                return;
            }
            setIncomingCall({ from, offer, callType, callId });
            setOutgoing(false);
            setInCall(false);
            callStartedRef.current = false;
            activeCallIdRef.current = callId;
        });

        socketRef.current.on("call-answered", async ({ from, answer, callId }) => {
            console.log("useCall: got call-answered for callId:", callId, "from:", from);
            if (!pcRef.current) {
                console.warn("useCall: got call-answered but no pc exists");
                return;
            }
            if (callId && activeCallIdRef.current && callId !== activeCallIdRef.current) {
                console.log("useCall: ignoring call-answered for stale callId", callId);
                return;
            }
            try {
                if (answer) {
                    console.log("useCall: caller setRemoteDescription(answer) for callId", callId, "answer.sdp (first 400 chars):", (answer.sdp || "").slice(0, 400));
                    await pcRef.current.setRemoteDescription(answer);
                }
            } catch (err) {
                console.error("useCall setRemoteDescription(answer) failed:", err);
            }
        });

        socketRef.current.on("ice-candidate", async ({ from, candidate, callId }) => {
            if (callId && activeCallIdRef.current && callId !== activeCallIdRef.current) return;
            try {
                if (candidate && pcRef.current) await pcRef.current.addIceCandidate(candidate);
            } catch (err) {
                console.warn("useCall addIceCandidate failed", err);
            }
        });

        socketRef.current.on("call-started", ({ from, startedAt, callId }) => {
            console.log("useCall: received call-started from", from, "callId:", callId, "startedAt:", startedAt);
            if (callId && activeCallIdRef.current && callId !== activeCallIdRef.current) {
                console.log("useCall: ignoring call-started for stale callId", callId);
                return;
            }
            callStartedRef.current = true;
            setCallStartTime(startedAt || Date.now());
            setInCall(true);
            setOutgoing(false);
            setIncomingCall(null);
        });

        socketRef.current.on("call-ended", ({ from, callId }) => {
            console.log("useCall: received call-ended from", from, "callId:", callId);
            if (callId && activeCallIdRef.current) {
                if (callId === activeCallIdRef.current) {
                    console.log("useCall: call-ended matches activeCallId -> cleaning up", callId);
                    cleanupCall();
                    return;
                } else {
                    console.log("useCall: call-ended for different callId, ignoring", callId);
                    return;
                }
            }
            if (callId && !activeCallIdRef.current) {
                console.log("useCall: call-ended for callId with no activeCall -> marking pendingEnded:", callId);
                pendingEndedCallIdsRef.current.add(callId);
            } else {
                cleanupCall();
            }
        });

        socketRef.current.on("disconnect", (reason) => {
            console.log("useCall: socket disconnected", reason);
            cleanupCall();
        });

        return () => {
            try { socketRef.current && socketRef.current.disconnect(); } catch { }
            cleanupCall();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    function createPeerConnection(remoteUserId) {
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        // fallback stream placeholder for initial state
        const remoteStreamObj = new MediaStream();
        setRemoteStream(remoteStreamObj);

        // --- Persistent merged ontrack handler (no repeated srcObject swaps) ---
        // Create a single persistent MediaStream that we assign once to React state.
        const mergedRemoteStream = new MediaStream();
        setRemoteStream(mergedRemoteStream);

        pc.ontrack = (event) => {
            try {
                const tr = event.track;
                const streamsLen = (event.streams && event.streams.length) || 0;
                console.log("useCall: pc.ontrack event track.kind:", tr?.kind, "streams.length:", streamsLen);

                const addIfMissing = (track) => {
                    try {
                        if (mergedRemoteStream.getTrackById(track.id)) return;
                        mergedRemoteStream.addTrack(track);
                        console.log("useCall: mergedRemoteStream.addTrack ->", track.kind, track.id);
                        const onEnded = () => {
                            try {
                                mergedRemoteStream.removeTrack(track);
                                console.log("useCall: mergedRemoteStream.removeTrack (ended) -> has", mergedRemoteStream.getTracks().length, "tracks");
                            } catch (e) { /* swallow */ }
                            track.removeEventListener && track.removeEventListener("ended", onEnded);
                        };
                        track.addEventListener && track.addEventListener("ended", onEnded);
                    } catch (e) {
                        console.warn("useCall: addIfMissing failed", e);
                    }
                };

                // If the browser provided event.streams[0], prefer using its tracks (it may contain both audio+video).
                if (event.streams && event.streams[0]) {
                    const s0 = event.streams[0];
                    s0.getTracks().forEach(addIfMissing);
                    console.log("useCall: ontrack -> mergedRemoteStream tracks now:", mergedRemoteStream.getTracks().map(t => t.kind));
                    return;
                }

                // fallback: single track event
                if (tr) {
                    addIfMissing(tr);
                    console.log("useCall: ontrack -> mergedRemoteStream tracks now:", mergedRemoteStream.getTracks().map(t => t.kind));
                    return;
                }

                console.warn("useCall: ontrack had no streams or track", event);
            } catch (err) {
                console.error("useCall: ontrack handler error", err);
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                try {
                    socketRef.current.emit("ice-candidate", {
                        to: remoteUserId,
                        candidate: event.candidate,
                        callId: activeCallIdRef.current,
                    });
                } catch (e) {
                    console.warn("useCall emit ice-candidate failed", e);
                }
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log("useCall pc connection state:", state);
            if (state === "connected") {
                if (!callStartedRef.current) {
                    const startedAt = Date.now();
                    setCallStartTime(startedAt);
                    callStartedRef.current = true;
                    setInCall(true);
                    setOutgoing(false);
                    setIncomingCall(null);
                    try {
                        socketRef.current?.emit("call-started", {
                            to: remoteUserId,
                            startedAt,
                            callId: activeCallIdRef.current,
                        });
                        console.log("useCall: emitted call-started to", remoteUserId, startedAt);
                    } catch (e) {
                        console.warn("useCall emit call-started failed", e);
                    }
                } else {
                    setInCall(true);
                    setOutgoing(false);
                    setIncomingCall(null);
                }
            }

            if (state === "disconnected" || state === "failed" || state === "closed") {
                cleanupCall();
            }
        };

        return pc;
    }

    async function getLocalMedia({ audio = true, video = false } = {}) {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio, video });
            setLocalStream(s);
            return s;
        } catch (err) {
            console.error("useCall getLocalMedia error:", err);
            return null;
        }
    }

    // Caller creates offer
    async function callUser(toUserId, callType = "video") {
        if (!socketRef.current) throw new Error("Socket not connected");
        if (!toUserId) throw new Error("No target user id");

        const callId = makeCallId(userId);
        activeCallIdRef.current = callId;
        callStartedRef.current = false;

        console.log("useCall.callUser -> attempting to call:", toUserId, "type:", callType, "callId:", callId);

        setOutgoing(true);
        setIncomingCall(null);
        setInCall(false);

        const stream = await getLocalMedia({ audio: true, video: callType === "video" });
        if (!stream) {
            setOutgoing(false);
            throw new Error("Failed to get local media");
        }

        const pc = createPeerConnection(toUserId);

        // add explicit transceivers so answerer will have m= lines to attach receive tracks
        try {
            if (callType === "video") {
                pc.addTransceiver("video", { direction: "sendrecv" });
                pc.addTransceiver("audio", { direction: "sendrecv" });
                console.log("useCall.callUser: added sendrecv transceivers for video & audio");
            } else {
                pc.addTransceiver("audio", { direction: "sendrecv" });
                console.log("useCall.callUser: added sendrecv transceiver for audio");
            }
        } catch (e) {
            console.log("useCall: addTransceiver may be unsupported in this browser:", e);
        }

        try {
            stream.getTracks().forEach((t) => pc.addTrack(t, stream));
            setLocalStream(stream);
        } catch (e) {
            console.warn("useCall.callUser: failed to add tracks to pc", e);
        }

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log("useCall.callUser: caller localDescription.sdp (first 400 chars):", (pc.localDescription?.sdp || "").slice(0, 400));

            try {
                const tx = pc.getTransceivers ? pc.getTransceivers().map(t => ({ kind: t.receiver?.track?.kind || t.sender?.track?.kind || t.mid, direction: t.direction })) : [];
                console.log("useCall.callUser: transceivers:", tx);
            } catch (e) { console.log('useCall.callUser: transceivers read failed', e); }
        } catch (err) {
            console.error("useCall.callUser: createOffer/setLocalDescription failed", err);
            throw err;
        }

        try {
            socketRef.current.emit("call-user", {
                to: toUserId,
                offer: pc.localDescription,
                callType,
                callId,
            });
            console.log("useCall: emitted call-user ->", toUserId, "callId:", callId);
        } catch (e) {
            console.warn("useCall emit call-user failed", e);
        }

        return { callId };
    }

    // Answerer flow: setRemoteDescription first, ensure recv transceivers, then attach local tracks
    async function answerCall() {
        if (!incomingCall) return;
        const { from, offer, callType, callId } = incomingCall;

        activeCallIdRef.current = callId;
        callStartedRef.current = false;

        const pc = createPeerConnection(from);

        try {
            console.log("useCall.answerCall: offer.sdp (first 400 chars):", (offer?.sdp || "").slice(0, 400));
            await pc.setRemoteDescription(offer);

            // Ensure receive transceivers exist (some browsers need explicit m-lines)
            try {
                const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
                const hasVideo = transceivers.some((t) => t.kind === "video");
                const hasAudio = transceivers.some((t) => t.kind === "audio");

                if (callType === "video") {
                    if (!hasVideo) {
                        try { pc.addTransceiver("video", { direction: "recvonly" }); console.log("useCall.answerCall: added recvonly video transceiver"); } catch (e) { console.log("addTransceiver(video) failed", e); }
                    }
                    if (!hasAudio) {
                        try { pc.addTransceiver("audio", { direction: "recvonly" }); console.log("useCall.answerCall: added recvonly audio transceiver"); } catch (e) { console.log("addTransceiver(audio) failed", e); }
                    }
                } else {
                    if (!hasAudio) {
                        try { pc.addTransceiver("audio", { direction: "recvonly" }); console.log("useCall.answerCall: added recvonly audio transceiver"); } catch (e) { console.log("addTransceiver(audio) failed", e); }
                    }
                }

                try { console.log('useCall.answerCall: transceivers after ensuring:', pc.getTransceivers().map(t => ({ mid: t.mid, kind: t.receiver?.track?.kind || t.sender?.track?.kind || t.mid, direction: t.direction }))); } catch (e) { }
            } catch (e) {
                console.log("useCall.answerCall: transceiver check/add failed (non-fatal):", e);
            }

            const stream = await getLocalMedia({ audio: true, video: callType === "video" });
            if (!stream) throw new Error("Failed to get local media for answer");

            // --- robust attach using transceivers/sender.replaceTrack when possible ---
            try {
                const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];

                console.log("useCall.answerCall: existing transceivers before attaching local tracks:", transceivers.map(t => ({ mid: t.mid, kind: t.receiver?.track?.kind || t.sender?.track?.kind || t.mid, direction: t.direction })));

                function attachTrackToTransceiverOrAdd(track, kind) {
                    try {
                        const candidate = transceivers.find(t => t && (t.receiver?.track?.kind === kind))
                            || transceivers.find(t => t && t.kind === kind && (t.direction === "recvonly" || t.direction === "sendrecv"))
                            || transceivers.find(t => t && t.kind === kind);
                        if (candidate) {
                            try { candidate.direction = "sendrecv"; } catch (e) { }
                            if (candidate.sender && candidate.sender.replaceTrack) {
                                candidate.sender.replaceTrack(track);
                                console.log("useCall.answerCall: replaced track on transceiver.sender for", kind);
                                return true;
                            }
                        }
                    } catch (err) {
                        console.warn("useCall.answerCall: transceiver attach attempt failed", err);
                    }

                    try {
                        pc.addTrack(track, stream);
                        console.log("useCall.answerCall: fallback addTrack used for", kind);
                        return true;
                    } catch (e) {
                        console.warn("useCall.answerCall: addTrack fallback failed", e);
                        return false;
                    }
                }

                stream.getTracks().forEach((t) => {
                    attachTrackToTransceiverOrAdd(t, t.kind);
                });

                try {
                    const afterTrans = pc.getTransceivers ? pc.getTransceivers().map(t => ({ mid: t.mid, kind: t.receiver?.track?.kind || t.sender?.track?.kind || t.mid, direction: t.direction })) : [];
                    console.log("useCall.answerCall: transceivers after attaching local tracks:", afterTrans);
                } catch (e) { }

                setLocalStream(stream);
            } catch (e) {
                console.warn("useCall.answerCall: failed to attach local tracks robustly", e);
                try {
                    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
                    setLocalStream(stream);
                    console.log("useCall.answerCall: fallback naive addTrack succeeded");
                } catch (err) {
                    console.error("useCall.answerCall: fallback naive addTrack also failed", err);
                }
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            console.log("useCall.answerCall: answer.sdp (first 400 chars):", (pc.localDescription?.sdp || "").slice(0, 400));

            socketRef.current.emit("make-answer", {
                to: from,
                answer: pc.localDescription,
                callId,
            });
            console.log("useCall.answerCall: emitted make-answer for callId", callId);

            setIncomingCall(null);
            setOutgoing(false);
        } catch (err) {
            console.error("useCall answerCall error:", err);
            cleanupCall();
            throw err;
        }
    }

    function cleanupCall() {
        try {
            if (pcRef.current) {
                try {
                    pcRef.current.getSenders().forEach((s) => { try { s.track && s.track.stop(); } catch { } });
                } catch { }
                try { pcRef.current.close(); } catch { }
            }
        } catch (e) { }

        pcRef.current = null;

        if (localStream) {
            try { localStream.getTracks().forEach((t) => { try { t.stop(); } catch { } }); } catch { }
        }

        setLastEndedAt(Date.now());

        setLocalStream(null);
        setRemoteStream(null);
        setIncomingCall(null);
        setOutgoing(false);
        setInCall(false);
        setCallStartTime(null);
        callStartedRef.current = false;
        activeCallIdRef.current = null;
        pendingEndedCallIdsRef.current.clear();
    }

    function endCall(toUserId) {
        try {
            if (socketRef.current) {
                socketRef.current.emit("end-call", {
                    to: toUserId,
                    callId: activeCallIdRef.current,
                });
            }
        } catch (e) {
            console.warn("useCall endCall emit error", e);
        }
        cleanupCall();
    }

    return {
        socket: socketRef.current,
        localStream,
        remoteStream,
        incomingCall,
        outgoing,
        inCall,
        callStartTime,
        lastEndedAt,
        callUser: callUser,
        answerCall,
        endCall,
        cleanupCall,
        getLocalMedia,
    };
}
