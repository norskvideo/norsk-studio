import { ChangeEvent, useEffect, useState } from "react";

import type { AwsTranscribeConfig, LanguageInfo, LanguagesResult } from "./runtime";

type TranscribeLanguageSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
  latest: Partial<AwsTranscribeConfig>
}

function TranscribeLanguageSelection(props: TranscribeLanguageSelectionProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = async () => {
      const result = await fetch('components/processor.aws-transcribe/languages')
      if (result.ok && result.body) {
        const languages = await result.json() as LanguagesResult;
        setLanguages(languages.transcribe);
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

  const [languages, setLanguages] = useState<LanguageInfo[]>([]);

  if (loading) {
    return <div>Loading..</div>
  }

  if (languages.length == 0) {
    return <div>No flows loaded</div>
  }

  return <div>
    <select defaultValue={props.defaultValue} className={`node-editor-select-input`} id={props.id} onChange={myOnChange} onBlur={myOnChange}>
      <option key="empty" value=''>---</option>
      {languages.map((o, i) => {
        const val = o.code;
        return <option key={i} value={val}>{o.name} ({o.code})</option>
      })}
    </select>
  </div>


  function myOnChange(e: ChangeEvent<HTMLSelectElement>) {
    props.onChanged(e.target.value);
  }
}

export default TranscribeLanguageSelection;
