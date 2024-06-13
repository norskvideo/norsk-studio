import { ChangeEvent, useEffect, useState } from "react";
import type { DynamicBugState, DynamicBugConfig, DynamicBugCommand, DynamicBugOrientation } from "./runtime";

function SummaryView({ state, config, sendCommand }: { state: DynamicBugState, config: DynamicBugConfig, sendCommand: (cmd: DynamicBugCommand) => void }) {

  const [bug, setBug] = useState(state.activeBug?.file ?? config.defaultBug);
  const [orientation, setOrientation] = useState(state.activeBug?.orientation ?? config.defaultOrientation);
  const [bugs, setBugs] = useState<string[]>([]);

  const [fileToUpload, setFileToUpload] = useState<File | undefined>(undefined);

  async function updateBugs() {
    const result = await fetch('components/processor.dynamicBug/bugs')
    if (result.ok && result.body) {
      const bugs = await result.json() as string[];
      setBugs(bugs);
    } else {
      const text = await result.text();
      throw new Error(text);
    }

  }

  useEffect(() => {
    const fn = async () => {
      await updateBugs();
    }
    fn().catch(console.error);
  }, [])


  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0])
      setFileToUpload(e.target.files[0]);
  }

  return <>
    <h2>Controls</h2>
    <label htmlFor="select-preview" className="mt-2">Source</label>
    <select id="select-bug" className="mt-2 node-editor-select-input" onChange={(e) => {
      setBug(e.currentTarget.value)
    }}>
      <option selected={bug === undefined}>---</option>
      <option value='new' selected={bug === 'new'}>New</option>
      {bugs.map((s, i) =>
        <option selected={bug == s} key={i} value={s}>{s}</option>
      )}
    </select>

    <form style={{ display: bug === 'new' ? 'block' : 'none' }} onSubmit={(e) => e.preventDefault()}>
      <input type="file" id="file" name="filename" onChange={onFileChange} />
    </form >

    <select id="select-orientation" className="mt-2 node-editor-select-input" onChange={(e) => {
      setOrientation(e.currentTarget.value as DynamicBugOrientation)
    }}>
      <option selected={orientation === undefined}>---</option>
      <option value='topleft' selected={orientation === 'topleft'}>Top Left</option>
      <option value='topright' selected={orientation === 'topright'}>Top Right</option>
      <option value='bottomleft' selected={orientation === 'bottomleft'}>Bottom Left</option>
      <option value='bottomright' selected={orientation === 'bottomright'}>Bottom Right</option>
    </select>
    {
      (bug != state.activeBug?.file || orientation != state.activeBug?.orientation || fileToUpload) ?
        <button type="button" className="mt-2 mb-2 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800"
          onClick={async (e) => {
            e.preventDefault();

            // Upload a file first
            if (fileToUpload && bug === 'new') {
              const form = new FormData()
              const url = `http://${document.location.hostname}:${config.apiPort}/bugs`;
              form.append('file', fileToUpload)
              await fetch(url, {
                method: 'POST',
                body: form
              })

              // probably don't need this but..
              setTimeout(async () => {
                await updateBugs();
                sendCommand({ type: "change-bug", file: fileToUpload.name, orientation });
                setBug(fileToUpload.name);
                setFileToUpload(undefined);
                return;
              }, 500)


            } else {
              sendCommand({ type: "change-bug", file: bug, orientation });
            }

          }}>Commit</button> : <></>
    }
  </>
}

export default SummaryView;
