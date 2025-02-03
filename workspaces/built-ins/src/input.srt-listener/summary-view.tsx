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
  return (
    <div className="dark:text-white text-black w-60">
      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2 dark:text-gray-300">Connected Sources</h3>
        <ul className="space-y-2">
          {connectedSources.map((streamId) => (
            <li key={streamId} className="flex items-center justify-between group">
              <span className="text-green-400 font-medium">{streamId}</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleResetStream(streamId)}
                  className="opacity-80 group-hover:opacity-100 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => handleDisableStream(streamId)}
                  className="opacity-80 group-hover:opacity-100 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  Disable
                </button>
              </div>
            </li>
          ))}
          {connectedSources.length === 0 && (
            <li className="text-sm text-gray-500 dark:text-gray-400 italic">No connected sources</li>
          )}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2 dark:text-gray-300">Disconnected Sources</h3>
        <ul className="space-y-2">
          {disconnectedSources.map((streamId) => (
            <li key={streamId} className="flex items-center justify-between group">
              <span className="text-orange-300 font-medium">{streamId}</span>
              {state.disabledStreams.includes(streamId) ? (
                <button
                  onClick={() => handleEnableStream(streamId)}
                  className="opacity-80 group-hover:opacity-100 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Enable
                </button>
              ) : (
                <button
                  onClick={() => handleDisableStream(streamId)}
                  className="opacity-80 group-hover:opacity-100 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  Disable
                </button>
              )}
            </li>
          ))}
          {disconnectedSources.length === 0 && (
            <li className="text-sm text-gray-500 dark:text-gray-400 italic">No disconnected sources</li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default SummaryView;
