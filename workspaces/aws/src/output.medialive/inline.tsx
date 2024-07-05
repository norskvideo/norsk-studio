import { useEffect } from "react";
import type { MediaLiveConfig, MediaLiveState } from "./runtime";
import Hls from 'hls.js';

function InlineView({ state, config }: { state: MediaLiveState, config: MediaLiveConfig }) {
  const url = state.url;
  const id = config.id;
  useEffect(() => {
    if (!url) return;

    const element = document.getElementById(`${id}-video`) as HTMLMediaElement;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(element);
    }
    else if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = url;
    }
  }, [state.url]);

  if (!url) return <>...</>

  return <div className="preview-outer-container">
    <video autoPlay={true} muted={true} id={`${id}-video`}></video>
  </div >
}

export default InlineView;
