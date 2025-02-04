import type {
  WhepOutputSettings,
  WhepOutputCommand,
  WhepOutputState,
} from "./runtime";
import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";

function SummaryView({
  state,
  sendCommand,
}: ViewProps<WhepOutputSettings, WhepOutputState, WhepOutputCommand>) {

  const handleEnableOutput = (): void => {
    void enableOutput();
  };

  const enableOutput = async () => {
    sendCommand({
      type: "enable-output",
    });
  };

  const handleDisableOutput = (): void => {
    void disableOutput();
  };

  const disableOutput = async () => {
    sendCommand({
      type: "disable-output",
    });
  };

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              state.enabled ? "bg-blue-500" : "bg-red-500"
            }`}
          ></span>
          <span className="text-sm">
            Status: {state.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div>
          {state.enabled ? (
            <button
              onClick={handleDisableOutput}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
            >
              Disable Output
            </button>
          ) : (
            <button
              onClick={handleEnableOutput}
              className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Enable Output
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SummaryView;
