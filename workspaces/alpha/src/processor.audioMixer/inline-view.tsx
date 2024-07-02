import type * as CSS from 'csstype';
import type { AudioMixerState, AudioMixerSettings } from "./runtime";

export function mkSourceKey(sourceId: string, key?: string) {
  return key ? sourceId + "-" + key : sourceId
}

function InlineView({ state }: { state: AudioMixerState, config: AudioMixerSettings }) {
  // const id = config.id;
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

  const sourcesOrdered = state.knownSources.filter(({ id }) => id !== "mixer-output")
  const mixerOutput = state.knownSources.find(({ id }) => id === "mixer-output")
  if (mixerOutput) {
    sourcesOrdered.push(mixerOutput)
  }

  function mkGridColumns(): CSS.Properties {
    const gridRows = Array(Math.ceil((sourcesOrdered.length - 1) / 3)).fill("108px")
    return {
      /* eslint-disable  @typescript-eslint/no-explicit-any */
      ["gridTemplateRows" as any]: gridRows.join(" ")
    }
  }

  return !state.displayInlineChannels ? <></> : <div id="mixer-level-container-inline" className="grid mt-4" style={mkGridColumns()}>
    {sourcesOrdered.map((s, i) => {
      const source = state.sources[mkSourceKey(s.id, s.key)]
      const isMasterOutput = i == sourcesOrdered.length - 1
      if (source) {
        return <div key={mkSourceKey(s.id, s.key)} className={`grid justify-start w-full ${isMasterOutput ? "inline-master-channel" : ""}`}>
          <div title={s.key ?? s.id} className={`preview-levels dark:text-slate-100 text-black relative ${isMasterOutput ? "inline-master-border" : ""}`} >
            <div className='inline-channel-name absolute'>{isMasterOutput ? "Master" : s.key ?? s.id}</div>
            < div className={`preview-level clip-${percentage(source.levels)}`
            }></div>
          </div >
        </div >
      }
      return <></>
    })}

  </div >
}
export default InlineView;
