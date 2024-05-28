import { useEffect } from "react";
import type { CmafOutputState, AutoCmafConfig } from "./runtime";
import Hls from 'hls.js';

function FullscreenView({ state, config }: { state: CmafOutputState, config: AutoCmafConfig }) {
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

  { /*  Styling left as an exercise to those who wish to demo */ }
  return <div>
    <video controls={true} autoPlay={true} muted={true} id={`${id}-video`}></video>
  </div >
}

export default FullscreenView;
