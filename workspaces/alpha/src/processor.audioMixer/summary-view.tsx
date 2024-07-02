import { AudioMixerCommand, AudioMixerSettings, AudioMixerState } from "./runtime";

function SummaryView({ state, sendCommand }: { state: AudioMixerState, config: AudioMixerSettings, sendCommand: (cmd: AudioMixerCommand) => void }) {
  return <div className="mb-8">
    <label className="mr-2.5" htmlFor="disable-inline">Display inline channels</label>
    <input
      checked={state.displayInlineChannels}
      type="checkbox"
      id="disable-inline"
      onChange={(e) => {
        const display = e.target.checked
        sendCommand({ type: "display-inline-channels-cmd", display })
      }
      }></input>
  </div>

}

export default SummaryView
