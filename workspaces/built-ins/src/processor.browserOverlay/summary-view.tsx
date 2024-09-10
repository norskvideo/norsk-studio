import { useMemo, useState } from "react";
import type { BrowserOverlayConfig, BrowserOverlayState, BrowserOverlayCommand } from "./runtime";
import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";


function SummaryView({state, sendCommand}: ViewProps<BrowserOverlayConfig, BrowserOverlayState, BrowserOverlayCommand>) {
  const [url, setUrl] = useState(state.currentUrl);
  const [enabled, setEnabled] = useState(state.enabled);
  const stateChanged = useMemo(() => {
    return url !== state.currentUrl || enabled !== state.enabled;
  }, [url, enabled]);
  
  const buttonClass = "mt-2 mb-5 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800";

  return (
    <div className="space-y-3 mb-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Controls</h2>
      <div className="mb-5">
        <label htmlFor="url" className="mb-2 mr-2 text-sm font-medium text-gray-900 dark:text-white">URL</label>
        <input type="email" id="url" className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" value={url} onChange={(e) => setUrl(e.target.value)} required />
      </div>
      <div className="mb-5">
      <label className="inline-flex items-center cursor-pointer">
        <span className="me-3 text-sm font-medium text-gray-900 dark:text-gray-300">Enabled</span>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="sr-only peer"/>
        <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
      </label>
      </div>
      <button
        type="button"
        className={`${buttonClass} ${!stateChanged ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={!stateChanged}
        onClick={() => {
          if (url !== state.currentUrl) {
            sendCommand({ type: "change-url", url });
          }
          if (enabled !== state.enabled) {
            if (enabled) {
              sendCommand({ type: "enable"});
            }
            else {
              sendCommand({ type: "disable"});
            }
          }
        }}
      >
        Commit
      </button>
    </div>
  );
}

export default SummaryView;


