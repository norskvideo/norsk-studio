import { useEffect, useRef } from "react";
import type { MonetiseOutputCommand, MonetiseOutputSettings, MonetiseOutputState } from "./runtime";

import { WhepClient } from '@norskvideo/webrtc-client'

function InlineView({ state, config, sendCommand }: { state: MonetiseOutputState, config: MonetiseOutputSettings, sendCommand: (command: MonetiseOutputCommand) => void }) {
  const url = state.url;
  const id = config.id;

  const previewVideo = useRef<HTMLDivElement>(null)
  const durationSlider = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!url) return;
    setTimeout(() => {
      if (!url) return;
      if (!previewVideo.current) return;
      const client = new WhepClient({ url, container: previewVideo.current });
      void client.start();

    }, 1000.0); // I think WHEP needs a new event for when it is actually ready
  }, [state.url]);

  if (!url) return <>Starting up...</>

  return <div className="mb-5">
    <div ref={previewVideo} className="" id={`preview-${id}`}>
    </div>
    {state.currentAdvert ? <>Advert currently playing: {Math.floor(state.currentAdvert.timeLeftMs / 1000)}s</> :
      <>
        <label htmlFor="default-range" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Advert Duration ({durationSlider.current?.value ?? 16}s)</label>
        <input ref={durationSlider} id="default-range" type="range" defaultValue="16" min="16" max="120" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"></input>
        <button onClick={sendAdvertCommand} type="button" className="mt-2 mb-2 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800" >
          Inject Advert
        </button>
      </>
    }
  </div >

  function sendAdvertCommand() {
    if (!previewVideo.current) return;
    if (!durationSlider.current) return;
    sendCommand({
      type: "inject-advert",
      durationMs: parseInt(durationSlider.current.value, 10) * 1000
    })
  }
}

export default InlineView;
