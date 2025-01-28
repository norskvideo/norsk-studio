import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { RtmpInputCommand, RtmpInputSettings, RtmpInputState } from "./runtime";

function SummaryView({ state, config, urls, sendCommand }: ViewProps<RtmpInputSettings, RtmpInputState, RtmpInputCommand >) {
  const connectedSources: string[] = [];
  const disconnectedSources: string[] = [];
  
  config.streamNames.forEach((streamName) => {
    if (state.connectedSources.includes(streamName)) {
      connectedSources.push(streamName);
    } else {
      disconnectedSources.push(streamName);
    }
  });

  const handleDisconnectStream = (streamName: string): void => {
    void disconnectStream(streamName);
  };
  
  const disconnectStream = async (streamName: string) => {
    try {
      const response = await fetch(`${urls.staticUrl}/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ streamName }),
      });
  
      if (!response.ok) {
        console.error("Stream failed to disconnect");
      }
  
      sendCommand({
        type: "disconnect-source",
        streamName
      });
    } catch (error) {
      console.error("Failed to disconnect stream:", error);
    }
  };

  return (
    <div className="dark:text-white text-black mb-3 w-60">
      <div id="rtmp-sources-connected">
        <span>Sources connected</span>
        <ul>
          {connectedSources.map((streamName) => (
            <li key={streamName} className="flex items-center justify-between">
              <span className="text-green-300">{streamName}</span>
              <button
                onClick={ () => handleDisconnectStream(streamName)}
                className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      </div>
      
      <div id="rtmp-sources-disconnected" className="mt-3">
        <span>Sources disconnected</span>
        <ul>
          {disconnectedSources.map((streamName) => (
            <li key={streamName} className="flex items-center justify-between">
              <span className="text-orange-300">{streamName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default SummaryView;
