import { RtmpInputSettings, RtmpInputState, } from "./runtime";

function InlineView({ state, config }: { state: RtmpInputState, config: RtmpInputSettings }) {
  const maxSourceNum = 4;
  const sourcesToRender = state.connectedStreams.slice(0, maxSourceNum)
  if (state.connectedStreams.length > maxSourceNum) {
    sourcesToRender.push("...")
  }
  const connectedSources =
    <div className="mt-2">{state.connectedStreams.length > 0 ? <span>Connected sources</span> : <></>}
      <ul className="rtmp-input-connected-sources">
        {sourcesToRender.map((sourceName) => {
          return <li key={sourceName} className="text-green-300">{sourceName}</li>
        })}
      </ul>
    </div>
  return <div className="rtmp-input" id={`rtmp-input-${config.id}`}>
    {connectedSources}
  </div>
}

export default InlineView;
