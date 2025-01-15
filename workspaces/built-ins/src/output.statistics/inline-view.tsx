import { assertUnreachable } from "./info";
import type { StatisticsOutputState, StatisticsOutputSettings } from "./runtime";
import { StreamKey } from "@norskvideo/norsk-sdk";


function InlineView({ state }: { state: StatisticsOutputState, config: StatisticsOutputSettings }) {
  if (!state.previous)
    return <></>

  // Include commas between thousands places
  const format = (stat: number) =>
    Math.floor(stat).toLocaleString('en-US', { maximumFractionDigits: 0 });

  return <>
    {state.previous.allStreams.map((s, i) => {
      const metaCase = s.metadata.case;
      switch (metaCase) {
        case "audio":
          return <div key={i}>
            <div>StreamKey: {streamKey(s.streamKey)}</div>
            <div>Bitrate: {format(s.bitrate)}bps</div>
          </div>

        case "video":

          return <div key={i}>
            <div>StreamKey: {streamKey(s.streamKey)}</div>
            <div>Bitrate: {format(s.bitrate)}bps</div>
          </div>

        case "ancillary":
          return <></>

        case "subtitle":
          return <></>

        case "playlist":
          return <></>

        case undefined:
          return <></>

        default:
          assertUnreachable(metaCase);
      }
    })}
  </>
}
function streamKey(streamKey: StreamKey): string {
  return streamKey.streamId.toString();
}

export default InlineView;
