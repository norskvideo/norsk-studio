import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SrtInputCommand, SrtInputSettings, SrtInputState } from "./runtime";

function SummaryView({ state, config, sendCommand }: ViewProps<SrtInputSettings, SrtInputState, SrtInputCommand >) {
  const connectedSources: string[] = [];
  const disconnectedSources: string[] = [];

  const resetStream = async (streamId: string) => {
    try {
      sendCommand({
        type: "reset-source",
        streamId
      });
    } catch (error) {
      console.error("Failed to disconnect stream:", error);
    }
  };

  const disableStream = async (streamId: string) => {
    try {
      sendCommand({
        type: "disable-source",
        streamId
      });
    } catch (error) {
      console.error("Failed to disable stream:", error);
    }
  };

  const enableStream = async (streamId: string) => {
    try {
    
      sendCommand({
        type: "enable-source",
        streamId
      });
    } catch (error) {
      console.error("Failed to enable stream:", error);
    }
  };

  const handleResetStream = (streamId: string): void => {
    void resetStream(streamId);
  };

  const handleDisableStream = (streamId: string): void => {
    void disableStream(streamId);
  };

  const handleEnableStream = (streamId: string): void => {
    void enableStream(streamId);
  };

  config.streamIds.forEach((streamId) => {
    console.log(config.streamIds, state);
    if (state.connectedStreams.includes(streamId)) {
      connectedSources.push(streamId)
    } else {
      disconnectedSources.push(streamId)
    }
  })
  return <div className="dark:text-white text-black mb-3 w-60">
    <div id="srt-sources-connected">
      <span>Connected Sources</span>
      <ul>
        {connectedSources.map((streamId) => {
          return <li key={streamId} className="text-green-300">{streamId}
             <button
                onClick={() => handleResetStream(streamId)}
                className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Reset
              </button>
             <button
                onClick={() => handleDisableStream(streamId)}
                className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Disable
              </button>
          </li>
        })}
      </ul>
    </div>
    <div id="srt-sources-disconnected" className="mt-3">
      <span>Disconnected Sources</span>
      <ul>
        {disconnectedSources.map((streamId) => {
          return <li key={streamId} className="text-orange-300">{streamId}
            { state.disabledStreams.includes(streamId) ?
             <button
                onClick={() => handleEnableStream(streamId)}
                className="ml-2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Enable
              </button>
              :
             <button
                onClick={() => handleDisableStream(streamId)}
                className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Disable
              </button>
             }

          </li>
        })}
      </ul>
    </div>
  </div>
}

export default SummaryView;
