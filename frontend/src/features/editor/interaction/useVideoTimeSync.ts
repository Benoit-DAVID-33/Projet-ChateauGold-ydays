/**
 * Synchronise `currentTime` du store avec le lecteur : à chaque image pendant
 * la lecture (requestAnimationFrame), et sur seek / pause / fin. Le rendu
 * applique ainsi la fenêtre [startTime, endTime) de chaque annotation
 * (l'original ignorait la temporalité).
 */
import { useEffect, type RefObject } from "react";

import { useEditorStore } from "../store/editorStore";

const SYNC_EVENTS = ["timeupdate", "seeking", "seeked", "pause", "ended", "loadedmetadata"];

export function useVideoTimeSync(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) return;
    let frame = 0;
    const sync = () => useEditorStore.getState().setCurrentTime(video.currentTime);
    const loop = () => {
      sync();
      frame = !video.paused && !video.ended ? requestAnimationFrame(loop) : 0;
    };
    const onPlay = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };
    for (const type of SYNC_EVENTS) video.addEventListener(type, sync);
    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onPlay);
    sync();
    if (!video.paused) onPlay();
    return () => {
      for (const type of SYNC_EVENTS) video.removeEventListener(type, sync);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onPlay);
      cancelAnimationFrame(frame);
    };
  }, [videoRef, enabled]);
}
