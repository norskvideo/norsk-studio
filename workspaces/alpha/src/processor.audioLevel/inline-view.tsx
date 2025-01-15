import type { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";
import type { AudioLevelState, AudioLevelSettings } from "./runtime";
import { useEffect } from "react";

function InlineView({ state, raise }: ViewProps<AudioLevelSettings, AudioLevelState>) {
  raise && useEffect(raise, []);

  function percentage(levels: { peak: number; rms: number; } | undefined) {
    if (!levels) { return 0; }
    if (levels.peak == 0 && levels.rms == 0) { return 0; }

    // Rebase to 0-(-112)
    const rebase = levels.rms - 12.0;

    // Perentage ish
    const capped = 0 - (rebase / 112);

    // Pecentage snapped
    const snapped = Math.floor(capped * 10.0) * 10;

    return Math.max(0, 100 - snapped);
  }

  if (!state.levels) {
    return <></>
  }

  return <div className="audio-level-container-inline">
    <div className="preview-levels-inline">
      <div className={`preview-level clip-${percentage(state.levels)}`}></div>
    </div>
  </div >
}

export default InlineView;
