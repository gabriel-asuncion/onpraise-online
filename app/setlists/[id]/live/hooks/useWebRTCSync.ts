import { useEffect, useRef, useState, useCallback } from "react";

interface SyncPayload {
  action: "START" | "STOP" | "JUMP" | "QUEUE" | "TRACK_CHANGE" | "HEARTBEAT";
  [key: string]: any;
}

export function useWebRTCSync(setlistId: string, isMD: boolean, onCommandReceived: (payload: SyncPayload) => void) {
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<Map<string, any>>(new Map());
  const [rtcStatus, setRtcStatus] = useState<"disconnected" | "connecting" | "connected" | "hosting">("disconnected");
  
  // ✅ SURGICAL FIX: The reboot tick. This lets us externally force a restart if mobile data drops.
  const [rebootTick, setRebootTick] = useState(0); 
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCommandRef = useRef(onCommandReceived);
  useEffect(() => { handleCommandRef.current = onCommandReceived; }, [onCommandReceived]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;
    const mdHostId = `onstage-md-${setlistId}`;

    const initializeHost = async () => {
      const Peer = (await import("peerjs")).default;
      if (!isMounted) return;
      if (peerRef.current) { peerRef.current.destroy(); connectionsRef.current.clear(); }
      
      setRtcStatus("connecting");
      const peer = new Peer(mdHostId, { debug: 0 }); 
      
      peer.on("open", () => { if (isMounted) setRtcStatus("hosting"); });
      peer.on("connection", (conn) => {
        if (!isMounted) return;
        conn.on("open", () => {
          if (isMounted) connectionsRef.current.set(conn.peer, conn);
        });
        conn.on("close", () => {
          if (isMounted) connectionsRef.current.delete(conn.peer);
        });
        conn.on("error", () => {
          if (isMounted) connectionsRef.current.delete(conn.peer);
        });
      });
      peer.on("disconnected", () => {
        if (isMounted && !peer.destroyed) peer.reconnect();
      });
      peerRef.current = peer;
    };

    const initializeFollower = async () => {
      const Peer = (await import("peerjs")).default;
      if (!isMounted) return;
      if (peerRef.current) { peerRef.current.destroy(); connectionsRef.current.clear(); }
      
      setRtcStatus("connecting");
      const peer = new Peer({ debug: 0 });
      
      peer.on("open", () => {
        if (!isMounted) return;
        const conn = peer.connect(mdHostId, { reliable: false });
        
        conn.on("open", () => {
          if (isMounted) {
            setRtcStatus("connected");
            connectionsRef.current.set(mdHostId, conn);
          }
        });

        conn.on("data", (data: unknown) => {
          if (!isMounted) return;
          handleCommandRef.current(data as SyncPayload);
        });

        conn.on("close", () => {
          if (!isMounted) return;
          setRtcStatus("disconnected");
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = setTimeout(() => {
            if (isMounted) void initializeFollower();
          }, 3000);
        });
      });

      peer.on("error", () => {
        if (!isMounted) return;
        setRtcStatus("disconnected");
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          if (isMounted) void initializeFollower();
        }, 3000);
      });

      peerRef.current = peer;
    };

    const initDelay = setTimeout(() => {
      if (isMD) initializeHost();
      else initializeFollower();
    }, 800);

    return () => {
      isMounted = false;
      if (initDelay) clearTimeout(initDelay);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (peerRef.current) peerRef.current.destroy();
    };
  }, [setlistId, isMD, rebootTick]); // Reboot anytime tick changes

  const broadcastToFollowers = useCallback((payload: SyncPayload) => {
    if (!isMD || connectionsRef.current.size === 0) return;
    connectionsRef.current.forEach((conn) => {
      if (conn.open) conn.send(payload);
    });
  }, [isMD]);

  // ✅ Expose a trigger to let Supabase force a WebRTC reboot
  const forceReconnect = useCallback(() => {
    if (rtcStatus === "connected" || rtcStatus === "hosting") return;
    setRebootTick(t => t + 1);
  }, [rtcStatus]);

  return { rtcStatus, broadcastToFollowers, forceReconnect };
}