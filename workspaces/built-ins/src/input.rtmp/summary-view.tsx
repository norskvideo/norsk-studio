import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { RtmpInputCommand, RtmpInputSettings, RtmpInputState } from "./runtime";

function SummaryView({ state, config, sendCommand }: ViewProps<RtmpInputSettings, RtmpInputState, RtmpInputCommand >) {
  const connectedSources: string[] = [];
  const disconnectedSources: string[] = [];

  const resetStream = async (streamName: string) => {
    try {
      sendCommand({
        type: "reset-source",
        streamName
      });
    } catch (error) {
      console.error("Failed to disconnect stream:", error);
    }
  };

  const disableStream = async (streamName: string) => {
    try {
      sendCommand({
        type: "disable-source",
        streamName
      });
    } catch (error) {
      console.error("Failed to disable stream:", error);
    }
  };

  const enableStream = async (streamName: string) => {
    try {
      sendCommand({
        type: "enable-source",
        streamName
      });
    } catch (error) {
      console.error("Failed to enable stream:", error);
    }
  };

  const handleResetStream = (streamName: string): void => {
    void resetStream(streamName);
  };

  const handleDisableStream = (streamName: string): void => {
    void disableStream(streamName);
  };

  const handleEnableStream = (streamName: string): void => {
    void enableStream(streamName);
  };

  
  config.streamNames.forEach((streamName) => {
    if (state.connectedStreams.includes(streamName)) {
      connectedSources.push(streamName);
    } else {
      disconnectedSources.push(streamName);
    }
  });


  return <div className="dark:text-white text-black mb-3 w-60">
    <div id="rtmp-sources-connected">
      <span>Connected Sources</span>
      <ul>
        {connectedSources.map((streamName) => {
          return <li key={streamName} className="text-green-300">{streamName}
             <button
                onClick={() => handleResetStream(streamName)}
                className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Reset
              </button>
             <button
                onClick={() => handleDisableStream(streamName)}
                className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Disable
              </button>
          </li>
        })}
      </ul>
    </div>
    <div id="rtmp-sources-disconnected" className="mt-3">
      <span>Disconnected Sources</span>
      <ul>
        {disconnectedSources.map((streamName) => {
          return <li key={streamName} className="text-orange-300">{streamName}
            { state.disabledStreams.includes(streamName) ?
             <button
                onClick={() => handleEnableStream(streamName)}
                className="ml-2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Enable
              </button>
              :
             <button
                onClick={() => handleDisableStream(streamName)}
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
