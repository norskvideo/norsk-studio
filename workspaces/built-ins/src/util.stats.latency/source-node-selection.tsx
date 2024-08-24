import { ChangeEvent } from "react";
import type { DocumentDescription } from "@norskvideo/norsk-studio/lib/shared/document";

type SourceNodeSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
  latestDocument: DocumentDescription
}

function SourceNodeSelection(props: SourceNodeSelectionProps) {
  return <div>
    <select defaultValue={props.defaultValue} className={`node-editor-select-input`} id={props.id} onChange={myOnChange} onBlur={myOnChange}>
      <option key="empty" value=''>---</option>
      {Object.values(props.latestDocument.components).map((o, i) => {
        if (o.id == props.id) return <></>
        if (o.info.category === 'output') return;
        return <option key={i} value={o.id}>{o.config.displayName}</option>
      })}
    </select>
  </div>


  function myOnChange(e: ChangeEvent<HTMLSelectElement>) {
    props.onChanged(e.target.value);
  }
}

export default SourceNodeSelection;
