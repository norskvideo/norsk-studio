import { SrtOutputState } from "./runtime";
import React from "react";

function InlineView({ state }: { state: SrtOutputState }): React.JSX.Element {
  return (
    <div className="srt-output">
      {state.enabled ? (
        <div className="active text-green-500 dark:text-green-300">
          Output enabled
        </div>
      ) : (
        <div className="disabled text-gray-500 dark:text-gray-400">
          Output disabled
        </div>
      )}
    </div>
  );
}

export default InlineView;
