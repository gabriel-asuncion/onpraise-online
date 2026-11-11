import { useState, useEffect, useRef, type MutableRefObject } from "react";
import type { SongRecord } from "../types/setlist";

interface UseYouTubeSyncProps {
  activeSong: SongRecord | null;
  youtubeVolumeRef: MutableRefObject<number>;
  isYoutubeSyncEnabled: boolean; 
  onPlaybackStarted?: (currentTimeSeconds: number, videoId?: string) => void;
  onPlaybackError?: () => void;
}

type YouTubePlayer = {
  cueVideoById?: (videoId: string) => void;
  getCurrentTime?: () => number;
  getPlayerState?: () => number;
  getVideoData?: () => { video_id?: string };
  pauseVideo?: () => void;
  playVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume?: (volume: number) => void;
};

export function useYouTubeSync({
  activeSong, youtubeVolumeRef, isYoutubeSyncEnabled, onPlaybackStarted, onPlaybackError
}: UseYouTubeSyncProps) {
  
  const [isYtBuffering, setIsYtBuffering] = useState<boolean>(false);
  const [isYtPlayerReady, setIsYtPlayerReady] = useState(false);
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = activeSong?.youtube_url?.match(regExp);
  const youtubeVideoId = match?.[2]?.length === 11 ? match[2] : null;

  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const isYtPlayerReadyRef = useRef<boolean>(false);
  const ytSyncPendingRef = useRef<boolean>(false); 
  
  // ✅ SURGICAL FIX: A synchronous reference so the hardware clock never waits for a React render
  const isYtBufferingRef = useRef<boolean>(false);
  const onPlaybackStartedRef = useRef(onPlaybackStarted);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  const requestedVideoIdRef = useRef<string | null>(youtubeVideoId);
  useEffect(() => {
    onPlaybackStartedRef.current = onPlaybackStarted;
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackStarted, onPlaybackError]);

  useEffect(() => {
    requestedVideoIdRef.current = youtubeVideoId;
  }, [youtubeVideoId]);

  useEffect(() => {
    if (!youtubeVideoId || !isYoutubeSyncEnabled) return;
    let isActive = true;
    let readinessTimer: ReturnType<typeof setTimeout> | null = null;

    const initPlayer = () => {
      if (!isActive) return;
      const youtubeApi = (window as Window & { YT?: { Player?: new (element: string, options: unknown) => YouTubePlayer } }).YT;
      if (!youtubeApi?.Player) {
        readinessTimer = setTimeout(initPlayer, 200);
        return;
      }

      if (ytPlayerRef.current && isYtPlayerReadyRef.current && typeof ytPlayerRef.current.cueVideoById === "function") {
        const currentVideoId = requestedVideoIdRef.current;
        if (currentVideoId && loadedVideoIdRef.current !== currentVideoId) {
          loadedVideoIdRef.current = currentVideoId;
          try { ytPlayerRef.current.cueVideoById(currentVideoId); } catch {}
        }
      } else if (!ytPlayerRef.current) {
        loadedVideoIdRef.current = youtubeVideoId;
        try {
          ytPlayerRef.current = new youtubeApi.Player("yt-live-player-container", {
          height: "10px", width: "10px", videoId: youtubeVideoId,
          playerVars: { playsinline: 1, controls: 0, disablekb: 1 },
          events: {
            onReady: (event: { target: YouTubePlayer & { setVolume: (volume: number) => void } }) => {
              if (ytPlayerRef.current !== event.target) return;
              isYtPlayerReadyRef.current = true;
              setIsYtPlayerReady(true);
              event.target.setVolume(youtubeVolumeRef.current * 100);
              const currentVideoId = requestedVideoIdRef.current;
              if (currentVideoId && loadedVideoIdRef.current !== currentVideoId) {
                loadedVideoIdRef.current = currentVideoId;
                event.target.cueVideoById?.(currentVideoId);
              }
            },
            onStateChange: (event: {
              data: number;
              target: {
                getCurrentTime?: () => number;
                getVideoData?: () => { video_id?: string };
              };
            }) => {
              if (ytPlayerRef.current !== event.target) return;
              if (event.data === 3) {
                isYtBufferingRef.current = true;
                setIsYtBuffering(true);
              } else if (event.data === 1 || event.data === 2 || event.data === 0) {
                isYtBufferingRef.current = false;
                setIsYtBuffering(false);
                if (event.data === 1) {
                  onPlaybackStartedRef.current?.(
                    event.target.getCurrentTime?.() ?? 0,
                    event.target.getVideoData?.().video_id
                  );
                }
              }
            },
            onError: (event: { data: number; target: object }) => {
              if (ytPlayerRef.current !== event.target) return;
              isYtBufferingRef.current = false;
              setIsYtBuffering(false);
              onPlaybackErrorRef.current?.();
              console.warn("YouTube playback failed; the shared visual timeline will continue.", event.data);
            }
          }
          });
        } catch (error) {
          loadedVideoIdRef.current = null;
          console.warn("Could not initialize the optional YouTube player.", error);
          onPlaybackErrorRef.current?.();
        }
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!((window as Window & { YT?: unknown }).YT) && !existingScript) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    initPlayer();

    return () => {
      isActive = false;
      if (readinessTimer) clearTimeout(readinessTimer);
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") ytPlayerRef.current.pauseVideo();
    };
  }, [youtubeVideoId, isYoutubeSyncEnabled]);

  useEffect(() => {
    if (ytPlayerRef.current && isYtPlayerReadyRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      try { ytPlayerRef.current.setVolume(youtubeVolumeRef.current * 100); } catch(e) {}
    }
  }, [youtubeVolumeRef.current]);

  return {
    youtubeVideoId,
    isYtBuffering,
    setIsYtBuffering,
    isYtPlayerReady,
    ytPlayerRef,
    isYtPlayerReadyRef,
    ytSyncPendingRef,
    isYtBufferingRef
  };
}