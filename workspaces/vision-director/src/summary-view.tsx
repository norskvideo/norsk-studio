import { useEffect, useState } from "react";
import type { MultiCameraSelectState, MultiCameraSelectConfig, MultiCameraSelectCommand, MultiCameraSource } from "./runtime";

import { WhepClient } from '@norskvideo/webrtc-client'

const activeClasses = "active text-green-300 dark:text-green-300";
const availableClasses = "available text-green-300 dark:text-green-300";
const inactiveClasses = "inactive text-orange-300 dark:text-orange-300";

var currentClient: WhepClient | undefined = undefined; // eslint-disable-line

function SummaryView({ state, config, sendCommand }: { state: MultiCameraSelectState, config: MultiCameraSelectConfig, sendCommand: (cmd: MultiCameraSelectCommand) => void }) {

  const [previewSource, setPreviewSource] = useState<MultiCameraSource | undefined>(undefined);
  const [activePlayerSource, setActivePlayerSource] = useState<MultiCameraSource | undefined>(undefined)
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    if (previewSource !== activePlayerSource || initialLoad) {
      const player = previewSource == undefined ? state.previewPlayerUrl : state.players.find((p) => p.source.id == previewSource.id && p.source.key == previewSource.key)?.player;
      if (!player) return;

      // Set us up the whep
      if (currentClient) {
        // Do we have a stop??
        // we could do with a stop..
        currentClient.videoElements.forEach((e) => {
          e.remove();
        });
      }

      currentClient = new WhepClient({ url: player, container: document.getElementById(`${config.id}-preview`) ?? undefined });
      void currentClient.start();

      // And this gets done
      setActivePlayerSource(previewSource);
      setInitialLoad(false);
    }
  }, [
    previewSource,
    activePlayerSource,
    initialLoad,
    state.players
  ])

  return <>
    <h5>Sources</h5>
    <ul>
      {state.knownSources.map((s, i) =>
        state.activeSource.id == s.id && state.activeSource.key == s.key ?
          <li key={i} className={activeClasses}>{s.key ?? s.id} &lt;--</li>
          : state.availableSources.find((a) => s.id == a.id && s.key == a.key)
            ? <li key={i} className={availableClasses}>{s.key ?? s.id} (available)</li>
            : <li key={i} className={inactiveClasses}>{s.key ?? s.id} (inactive)</li>
      )}
    </ul>

    <h2>Controls</h2>

    <h4>{previewSource ? previewSource.key ?? previewSource.id : "Preview"}</h4>

    { /* Player here that by default shows output */}
    <div id={`${config.id}-preview`}></div>

    { /* Dropdown here, ... for not doing anything on select, change the preview player to that output */}
    { /* Sidenote: re-using CSS from Norsk Studio itself, should we? if so, best practises? */}
    <label htmlFor="select-preview" className="mt-2">Source</label>
    <select id="select-preview" className="mt-2 node-editor-select-input" onChange={(e) => {
      setPreviewSource(JSON.parse(e.currentTarget.value))
    }}>
      <option selected={previewSource === undefined}>---</option>
      {state.availableSources.map((s, i) =>
        <option selected={previewSource == s} key={i} value={JSON.stringify(s)}>{s.key ?? s.id}</option>
      )}
    </select>

    { /* Button to commit, sets dropdown back to '...' and player back to preview */}
    {previewSource ? <button type="button" className="mt-2 mb-2 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800" onClick={(e) => {
      e.preventDefault();
      sendCommand({ type: "select-source", source: previewSource });
      setPreviewSource(undefined);
    }}>Make Active</button> : <></>}
  </>
}

export default SummaryView;
