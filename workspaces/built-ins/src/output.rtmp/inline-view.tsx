import { RtmpOutputSettings, RtmpOutputState } from "./runtime";

function InlineView({ state, config }: { state: RtmpOutputState, config: RtmpOutputSettings }) {
  const connected = <div className="active text-green-300 dark:text-green-300">Connected and publishing</div>
  const disconnected = <div className="inactive text-orange-300 dark:text-orange-300">Disconnected {state.connectRetries > 0 ? `- retrying(${state.connectRetries})` : ""}</div>
  return <div className="rtmp-output" id={`rtmp-output-${config.id}`}>
    {state.connected ? connected : disconnected}
  </div>
}

export default InlineView;
