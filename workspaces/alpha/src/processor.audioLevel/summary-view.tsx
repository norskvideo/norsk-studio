import { useState } from "react";
import type { AudioLevelState, AudioLevelSettings, AudioLevelCommand } from "./runtime";

function SummaryView({ state, sendCommand }: { state: AudioLevelState, config: AudioLevelSettings, sendCommand: (cmd: AudioLevelCommand) => void }) {
  const [sliderValue, setSliderValue] = useState(state.sliderGain || "0")
  const [canSetVolume, setCanSetVolume] = useState(true)
  const throttleDelay = 100
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
  const gainClasses = state.levels ? "col-start-2 self-end" : "col-start-1 col-end-3 self-end justify-self-start"
  return <div className="audio-level-container grid mb-6 relative justify-items-center">
    <div className={`preview-levels-summary ${state.levels ? "" : "opacity-30"}`}>
      <div className="relative w-full h-full">
        <div className={`preview-level absolute h-full w-4/6 clip-${percentage(state.levels)}`}></div>
      </div>
      <div className="relative">
        <div className="text-sm absolute -top-1">0dB</div>
        <div className="text-sm absolute top-14">-50dB</div>
        <div className="text-sm absolute -bottom-2">-100dB</div>
      </div>
    </div>
    <div className="h-full flex items-center">
      <input id="audio-slider"
        className={`-rotate-90 h-2.5 ${state.levels ? "" : "opacity-20"}`}
        type="range"
        name="gain"
        min="-40"
        max="40"
        step="1"
        defaultValue={state.sliderGain || "0"}
        disabled={!state.levels}
        onChange={(e) => {
          setSliderValue(e.target.value)
          if (canSetVolume) {
            setCanSetVolume(false)
            sendCommand({ type: "set-gain", value: Number(e.target.value) })
            setTimeout(() => {
              setCanSetVolume(true)
            }, throttleDelay)
          }
        }}
        onMouseUp={(_e) => {
          sendCommand({ type: "set-gain", value: Number(sliderValue) })
        }} />
    </div>
    <div className={gainClasses}>
      {state.levels ? "Gain:" : "No incoming audio"}
    </div>
    <div className="col-start-2">{state.levels ? `${Number(sliderValue) > 0 ? "+" : ""} ${sliderValue} dB` : ""}</div>
  </div>
}

export default SummaryView;
