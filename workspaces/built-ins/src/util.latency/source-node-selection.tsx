import { ChangeEvent } from "react";
import type { DocumentDescription } from "norsk-studio/lib/shared/document";

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
      {Object.values(props.latestDocument.nodes).map((o, i) => {
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
