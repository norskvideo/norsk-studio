import { useEffect, useRef } from "react";
import type { CmafOutputState, AutoCmafConfig } from "./runtime";
import Hls from 'hls.js';

function InlineView({ state, config }: { state: CmafOutputState, config: AutoCmafConfig }) {
  const url = state.url;
  const id = config.id;
  const previewVideo = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!url) return;
    if (!previewVideo.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(previewVideo.current);
    }
    else if (previewVideo.current.canPlayType('application/vnd.apple.mpegurl')) {
      previewVideo.current.src = url;
    }
  }, [state.url]);

  if (!url) return <>...</>

  return <div className="mb-5">
    <video ref={previewVideo} autoPlay={true} muted={true} id={`${id}-video`}></video>
  </div >
}

export default InlineView;
