import { ChangeEvent, useEffect, useState } from "react";
import type { DynamicBugConfig } from "./runtime";

type BugSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
  latest: Partial<DynamicBugConfig>
}

function BugSelection(props: BugSelectionProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = async () => {
      const result = await fetch('components/processor.dynamicBug/bugs')
      if (result.ok && result.body) {
        const bugs = await result.json() as string[];
        setBugs(bugs);
        setLoading(false);
        if (props.defaultValue)
          props.onChanged(props.defaultValue);
      } else {
        const text = await result.text();
        throw new Error(text);
      }
    }
    fn().catch(console.error);
  }, [])

  const [bugs, setBugs] = useState<string[]>([]);

  if (loading) {
    return <div>Loading..</div>
  }

  if (bugs.length == 0) {
    return <div>No bugs loaded</div>
  }

  return <div>
    <select defaultValue={props.defaultValue} className={`node-editor-select-input`} id={props.id} onChange={myOnChange} onBlur={myOnChange}>
      <option key="empty" value=''>---</option>
      {bugs.map((o, i) => {
        return <option key={i} value={o}>{o}</option>
      })}
    </select>
  </div>


  function myOnChange(e: ChangeEvent<HTMLSelectElement>) {
    props.onChanged(e.target.value);
  }
}

export default BugSelection;
