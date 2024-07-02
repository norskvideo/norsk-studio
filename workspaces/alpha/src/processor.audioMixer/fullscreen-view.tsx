import type * as CSS from 'csstype';
import { useState } from "react";
import { type AudioMixerState, type AudioMixerSettings, type AudioMixerCommand } from "./runtime";

export function mkSourceKey(sourceId: string, key?: string) {
  return key ? sourceId + "-" + key : sourceId
}

function FullScreen({ state, sendCommand }: { state: AudioMixerState, config: AudioMixerSettings, sendCommand: (cmd: AudioMixerCommand) => void }) {
  const initialSliders: { [source: string]: number } = {}
  const initialPreMuteSliders: { [source: string]: number } = {}
  Object.keys(state.sources).forEach((k) => {
    if (state.sources[k]) {
      initialSliders[k] = state.sources[k].sliderGain || 0
      initialPreMuteSliders[k] = state.sources[k].preMuteSliderGain || 0
    }
  })
  const initialCanSetVolume: { [source: string]: boolean } = {}
  state.knownSources.forEach(({ id, key }) => initialCanSetVolume[mkSourceKey(id, key)] = true)
  const [canSetVolume, setCanSetVolume] = useState(initialCanSetVolume)
  const [sliderValues, setSliderValue] = useState(initialSliders)
  const [preMuteValues, setPreMuteValues] = useState(initialPreMuteSliders)
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

  function mkFader(sourceId: string, key?: string) {
    const source = mkSourceKey(sourceId, key)
    const levels = state.sources[source]
    return <div id={`audio-slider-${sourceId}${key ? "-" + key : ""}`}
      className={`${!levels?.levels ? "opacity-20" : ""} audio-mixer-fader-container grid content-center justify-center w-full relative`}>
      <input className="-rotate-90 audio-mixer-fader" type="range" name="gain"
        min={state.gainRange.minGain - 0.1}
        max={state.gainRange.maxGain}
        step="0.1"
        value={levels?.sliderGain || 0}
        disabled={!levels?.levels}
        onChange={(e) => {
          sliderValues[source] = Number(e.target.value)
          if (Number(e.target.value) < state.gainRange.minGain) {
            preMuteValues[source] = state.gainRange.minGain
          } else {
            preMuteValues[source] = Number(e.target.value)
          }
          setSliderValue(sliderValues)
          setPreMuteValues(sliderValues)
          if (state.sources[source].isMuted) {
            sendCommand({ type: "switch-mute-cmd", sourceId, key, preMuteSliderValue: preMuteValues[source] || 0, muted: false })
          }
          // If we slide below minGain (meaning mute), set pre-mute value to minGain
          // Now, if the unmute button is clicked, it will unmute to minGain
          if (Number(e.target.value) < state.gainRange.minGain) {
            sendCommand({ type: "switch-mute-cmd", sourceId, key, preMuteSliderValue: state.gainRange.minGain, muted: true })
          }
          if (canSetVolume[source] === true) {
            canSetVolume[source] = false
            setCanSetVolume(canSetVolume)
            sendCommand({ type: "set-gain-cmd", sourceId, key, value: Number(e.target.value) })
            setTimeout(() => {
              canSetVolume[source] = true
              setCanSetVolume(canSetVolume)
            }, throttleDelay)
          }
        }}
        onMouseUp={(_e) => {
          sendCommand({ type: "set-gain-cmd", sourceId, key, value: sliderValues[source] || 0 })
        }} />
      <div className="grid mixer-gain-db ml-2.5 absolute self-center">
        <div className="text-xs absolute border-t w-12">{state.gainRange.maxGain}dB</div>
        <div className="text-xs self-end border-b w-4 h-4"></div>
        <div className="text-xs self-end border-b w-12">{state.gainRange.maxGain * 0.75}dB</div>
        <div className="text-xs self-end border-b w-4 h-4"></div>
        <div className="text-xs self-end border-b w-12">{state.gainRange.maxGain * 0.5}dB</div>
        <div className="text-xs self-end border-b w-4 h-4"></div>
        <div className="text-xs self-end border-b w-12">{state.gainRange.maxGain * 0.25}dB</div>
        <div className="text-xs self-end border-b w-4 h-4"></div>
        <div className="text-xs self-end border-b w-12">0dB</div>
        <div className="text-xs self-end border-b w-4 h-4"></div>
        <div className="text-xs self-end border-b w-12">{state.gainRange.minGain * 0.25}dB</div>
        <div className="text-xs self-end border-b w-4 h-4"></div>
        <div className="text-xs self-end border-b w-12">{state.gainRange.minGain * 0.5}dB</div>
        <div className="text-xs self-end border-b w-4 h-4"></div>
        <div className="text-xs self-end border-b w-12">{state.gainRange.minGain * 0.75}dB</div>
        <div className="text-xs self-end border-b w-4 h-4"></div>
        <div className="text-xs self-end border-b w-12">{state.gainRange.minGain}dB</div>
      </div>
    </div>
  }

  function mkLevels(sourceId: string, key?: string) {
    const sourceKey = mkSourceKey(sourceId, key)
    const levels = state.sources[sourceKey]
    const mutedClass = sliderValues[sourceKey] < state.gainRange.minGain || state.sources[sourceKey]?.isMuted ? "level-muted" : ""
    return <div id={`level-${sourceId}${key ? "-" + key : ""}`}
      className={`preview-levels-mixer ${!state.sources[sourceKey]?.levels ? "opacity-30" : ""}`}>
      <div className="relative w-full h-full">
        <div className={`preview-level-mixer absolute h-full w-4/6 clip-${percentage(levels?.levels)} ${mutedClass}`}></div>
      </div>
      <div className="grid mixer-level-db ml-2.5 relative">
        <div className="text-xs absolute border-t w-12 -right-3.5">0dB</div>
        <div className="text-xs self-end border-b w-12">-25dB</div>
        <div className="text-xs self-end border-b w-12">-50dB</div>
        <div className="text-xs self-end border-b w-12">-75dB</div>
        <div className="text-xs self-end border-b w-12">-100dB</div>
      </div>
    </div>
  }

  function mkGainValue(sourceId: string, key?: string) {
    const sourceKey = mkSourceKey(sourceId, key)
    const sliderValue = sliderValues[sourceKey]
    const sliderValueText = sliderValue === undefined
      ? "- dB"
      : sliderValue < state.gainRange.minGain || state.sources[sourceKey]?.isMuted
        ? "muted"
        : sliderValue + "dB"
    return <div id={`gain-value-${sourceId}${key ? "-" + key : ""}`}
      className={`${!state.sources[sourceKey]?.levels ? "opacity-20" : ""} text-m`}>
      {sliderValueText}
    </div>
  }

  function muteIcon(sourceId: string, key?: string) {
    const sourceKey = mkSourceKey(sourceId, key)
    const mute = <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
    const unMute = <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>

    return <div className={`${!state.sources[sourceKey]?.levels ? "opacity-20" : ""} mute-icon self-center`} onClick={(_e) => {
      if (state.sources[sourceKey]) {
        if (state.sources[sourceKey].isMuted) {
          sendCommand({ type: "switch-mute-cmd", sourceId, key, preMuteSliderValue: preMuteValues[sourceKey] || 0, muted: false })
        } else {
          sendCommand({ type: "switch-mute-cmd", sourceId, key, preMuteSliderValue: preMuteValues[sourceKey] || 0, muted: true })
        }
      } else {
        console.warn("Could not find source with source key: " + sourceKey)
      }
    }}>
      {state.sources[sourceKey]?.isMuted ? mute : unMute}
    </div>
  }

  const sourcesOrdered = state.knownSources.filter(({ id }) => id !== "mixer-output")
  const mixerOutput = state.knownSources.find(({ id }) => id === "mixer-output")
  if (mixerOutput) {
    sourcesOrdered.push(mixerOutput)
  }

  function mkGridColumns(): CSS.Properties {
    const gridColumns = Array(state.knownSources.length).fill("140px")
    return {
      /* eslint-disable  @typescript-eslint/no-explicit-any */
      ["gridTemplateColumns" as any]: gridColumns.join(" ")
    }
  }

  return <div className="audio-mixer grid gap-x-8 justify-items-center" style={mkGridColumns()}>
    {sourcesOrdered.map((s, i) => {
      // Assume the master output is the last item
      const isMasterOutput = i == sourcesOrdered.length - 1
      const divKey = `${s.id}${s.key ? "-" + s.key : ""}`
      return <div key={divKey} className={`channel-container grid justify-items-center ${isMasterOutput ? "bg-gray-700 ml-12" : ""} `}>
        <div id={`channel-title-${divKey}`}>{isMasterOutput ? "Master" : s.key ?? s.id}</div>
        {mkLevels(s.id, s.key)}
        {muteIcon(s.id, s.key)}
        {mkFader(s.id, s.key)}
        {mkGainValue(s.id, s.key)}
      </div>
    })}
  </div>
}

export default FullScreen;
