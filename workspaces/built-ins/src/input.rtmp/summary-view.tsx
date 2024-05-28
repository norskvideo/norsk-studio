import { RtmpInputSettings, RtmpInputState } from "./runtime";

function SummaryView({ state, config }: { state: RtmpInputState, config: RtmpInputSettings }) {
  const connectedSources: string[] = [];
  const disconnectedSources: string[] = [];
  config.streamNames.forEach((streamName) => {
    if (state.connectedSources.includes(streamName)) {
      connectedSources.push(streamName)
    } else {
      disconnectedSources.push(streamName)
    }
  })
  return <div className="dark:text-white text-black mb-3 w-60">
    <div id="rtmp-sources-connected">
      <span>Sources connected</span>
      <ul>
        {connectedSources.map((streamId) => {
          return <li className="text-green-300">{streamId}</li>
        })}
      </ul>
    </div>
    <div id="rtmp-sources-disconnected" className="mt-3">
      <span>Sources disconnected</span>
      <ul>
        {disconnectedSources.map((streamId) => {
          return <li className="text-orange-300">{streamId}</li>
        })}
      </ul>
    </div>
  </div>

}

export default SummaryView;
