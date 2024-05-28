import { SrtInputSettings, SrtInputState } from "./runtime";

function SummaryView({ state, config }: { state: SrtInputState, config: SrtInputSettings }) {
  const connectedSources: string[] = [];
  const disconnectedSources: string[] = [];
  config.streamIds.forEach((streamId) => {
    if (state.connectedStreams.includes(streamId)) {
      connectedSources.push(streamId)
    } else {
      disconnectedSources.push(streamId)
    }
  })
  return <div className="dark:text-white text-black mb-3 w-60">
    <div id="srt-sources-connected">
      <span>Sources connected</span>
      <ul>
        {connectedSources.map((streamId) => {
          return <li key={streamId} className="text-green-300">{streamId}</li>
        })}
      </ul>
    </div>
    <div id="srt-sources-disconnected" className="mt-3">
      <span>Sources disconnected</span>
      <ul>
        {disconnectedSources.map((streamId) => {
          return <li key={streamId} className="text-orange-300">{streamId}</li>
        })}
      </ul>
    </div>
  </div>
}

export default SummaryView;
