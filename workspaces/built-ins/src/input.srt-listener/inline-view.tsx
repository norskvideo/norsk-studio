import { SrtInputSettings, SrtInputState } from "./runtime";

function InlineView({ state, config }: { state: SrtInputState, config: SrtInputSettings }) {
  const maxSourceNum = 4;
  const sourcesToRender = state.connectedStreams.slice(0, maxSourceNum)
  if (state.connectedStreams.length > maxSourceNum) {
    sourcesToRender.push("...")
  }
  const connectedSources =
    <div className="mt-2"> {state.connectedStreams.length > 0 ? <span>Connected sources</span> : <></>}
      <ul className="srt-input-connected-sources">
        {sourcesToRender.map((sourceName) => {
          return <li key={sourceName} className="text-green-300">{sourceName}</li>
        })}
      </ul>
    </div>
  return <div className="srt-input" id={`srt-input-${config.id}`}>
    {connectedSources}
  </div>
}

export default InlineView;