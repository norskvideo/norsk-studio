import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SrtInputCommand, SrtInputSettings, SrtInputState } from "./runtime";

function SummaryView({ state, config, urls, sendCommand }: ViewProps<SrtInputSettings, SrtInputState, SrtInputCommand >) {
  const connectedSources: string[] = [];
  const disconnectedSources: string[] = [];

  const disconnectStream = async (streamId: string) => {
    try {
      const response = await fetch(`${urls.componentUrl}/disconnect`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ streamId }),
        }
      );

      if (!response.ok) {
        console.error("Stream failed to disconnect");
      }

      sendCommand({
        type: "source-disconnected",
        streamId
      });
    } catch (error) {
      console.error("Failed to disconnect stream:", error);
    }
  };

  const handleDisconnectStream = (streamId: string): void => {
    void disconnectStream(streamId);
  };

  const reconnectStream = async (streamId: string) => {
    try {
      const response = await fetch(`${urls.componentUrl}/reconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ streamId })
      });

      if (!response.ok) {
        console.error("Failed to reconnect");
      }

      sendCommand({
        type: "source-connected",
        streamId,
      });
    } catch (error) {
      console.error("Failed to reconnect to stream", error);
    }
  };

  const handleReconnectStream = (streamId: string) => {
    void reconnectStream(streamId);
  };

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
          return <li key={streamId} className="text-green-300">{streamId}
             <button
                onClick={() => handleDisconnectStream(streamId)}
                className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Disconnect
              </button>
          
          </li>
        })}
      </ul>
    </div>
    <div id="srt-sources-disconnected" className="mt-3">
      <span>Sources disconnected</span>
      <ul>
        {disconnectedSources.map((streamId) => {
          return <li key={streamId} className="text-orange-300">{streamId}
             <button
                onClick={() => handleReconnectStream(streamId)}
                className="ml-2 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
              >
                Reconnect
              </button>
          </li>
        })}
      </ul>
    </div>
  </div>
}

export default SummaryView;
