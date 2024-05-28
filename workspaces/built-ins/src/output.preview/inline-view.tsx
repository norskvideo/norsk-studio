import { useEffect } from "react";
import type { PreviewOutputState, PreviewOutputSettings } from "./runtime";

import { WhepClient } from '@norskvideo/webrtc-client'

function InlineView({ state, config }: { state: PreviewOutputState, config: PreviewOutputSettings }) {
  const url = state.url;
  const id = config.id;
  useEffect(() => {
    if (!url) return;
    const client = new WhepClient({ url, container: document.getElementById(`preview-${id}`) ?? undefined });
    void client.start();
  }, [state.url]);

  if (!url) return <>...</>

  function percentage(levels: { peak: number; rms: number; } | undefined) {
    if (!levels) { return 0; }

    // Rebase to 0-(-112)
    const rebase = levels.rms - 12.0;

    // Perentage ish
    const capped = 0 - (rebase / 112);

    // Pecentage snapped
    const snapped = Math.floor(capped * 10.0) * 10;

    return Math.max(0, 100 - snapped);
  }


  return <div className="preview-outer-container">
    <div className="preview-video" id={`preview-${id}`}>
    </div>
    <div className="preview-levels">
      <div className={`preview-level clip-${percentage(state.levels)}-preview`}></div>
    </div>
  </div >
}

export default InlineView;
