import { ChangeEvent, useEffect, useState } from "react";
import type { DynamicBugState, DynamicBugConfig, DynamicBugCommand, DynamicBugPosition } from "./runtime";
import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";

function SummaryView({ state, sendCommand, httpApi }: ViewProps<DynamicBugConfig, DynamicBugState, DynamicBugCommand>) {

  const [bug, setBug] = useState(state.activeBug?.file);
  const [position, setPosition] = useState(state.activeBug?.position);
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
      setBug(e.currentTarget.value === '' ? undefined : e.currentTarget.value)
    }}>
      <option value="" selected={bug === undefined}>---</option>
      <option value='new' selected={bug === 'new'}>New</option>
      {bugs.map((s, i) =>
        <option selected={bug == s} key={i} value={s}>{s}</option>
      )}
    </select>

    <form style={{ display: bug === 'new' ? 'block' : 'none' }} onSubmit={(e) => e.preventDefault()}>
      <input type="file" id="file" name="filename" onChange={onFileChange} />
    </form >

    <select style={{ display: bug ? 'block' : 'none' }} id="select-position" className="mt-2 node-editor-select-input" onChange={(e) => {
      setPosition(e.currentTarget.value as DynamicBugPosition)
    }}>
      <option value='topleft' selected={position === 'topleft'}>Top Left</option>
      <option value='topright' selected={position === 'topright'}>Top Right</option>
      <option value='bottomleft' selected={position === 'bottomleft'}>Bottom Left</option>
      <option value='bottomright' selected={position === 'bottomright'}>Bottom Right</option>
    </select>
    {
      (bug != state.activeBug?.file || position != state.activeBug?.position || fileToUpload) ?
        <button type="button" className="mt-2 mb-2 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800"
          onClick={async (e) => {
            e.preventDefault();

            // Upload a file first
            if (fileToUpload && bug === 'new') {
              const form = new FormData()
              const url = httpApi.toString() + "/bugs"
              form.append('file', fileToUpload)
              await fetch(url, {
                method: 'POST',
                body: form
              })

              // probably don't need this but..
              setTimeout(async () => {
                await updateBugs();
                sendCommand({ type: "change-bug", file: fileToUpload.name, position });
                setBug(fileToUpload.name);
                setFileToUpload(undefined);
                return;
              }, 500)


            } else {
              sendCommand({ type: "change-bug", file: bug, position });
            }

          }}>Commit</button> : <></>
    }
  </>
}

export default SummaryView;
