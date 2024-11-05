import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { RtmpInputCommand, RtmpInputSettings, RtmpInputState } from "./runtime";

function SummaryView({ state, config, sendCommand }: ViewProps<RtmpInputSettings, RtmpInputState, RtmpInputCommand >) {
  const connectedSources: string[] = [];
  const disconnectedSources: string[] = [];
  
  config.streamNames.forEach((streamName) => {
    if (state.connectedSources.includes(streamName)) {
      connectedSources.push(streamName);
    } else {
      disconnectedSources.push(streamName);
    }
  });

  const disconnectStream = async (streamName: string) => {
    try {
        //const response = await fetch(`${urls.componentUrl}/disconnect`)
      const response = await fetch(
        "http://localhost:8000/live/api/rtmp/disconnect",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ streamName }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to disconnect stream");
      }

      sendCommand({
        type: "source-disconnected",
        streamName
      });
    } catch (error) {
      console.error("Failed to disconnect stream:", error);
    }
  };

  const reconnectStream = async (streamName: string) => {
    try {
      const response = await fetch("http://localhost:8000/live/api/rtmp/reconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ streamName })
      });

      if (!response.ok) {
        throw new Error("Failed to reconnect");
      }

      sendCommand({
        type: "source-connected",
        streamName,
      });
    } catch (error) {
      console.error("Failed to reconnect to stream", error);
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
                onClick={async () => await disconnectStream(streamName)}
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
              <button
                onClick={async () => await reconnectStream(streamName)}
                className="ml-2 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
              >
                Reconnect
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default SummaryView;
