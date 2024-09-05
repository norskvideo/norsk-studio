import { ChangeEvent, useEffect, useState } from "react";
import type { OnscreenGraphicConfig } from "./runtime";

type GraphicSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
  latest: Partial<OnscreenGraphicConfig>
}

function GraphicSelection(props: GraphicSelectionProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = async () => {
      const result = await fetch('components/processor.onscreenGraphic/bugs')
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

export default GraphicSelection;
