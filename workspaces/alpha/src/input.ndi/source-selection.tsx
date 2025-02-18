import { NdiSource } from "@norskvideo/norsk-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import CreatableSelect from "react-select/creatable";

type SourceSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
}

function SourceSelection(props: SourceSelectionProps) {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<{ value: string; label: string }[]>([]);
  const [inputValue, setInputValue] = useState(props.defaultValue || ""); 
  const isMounted = useRef(true);

  useEffect(() => {
    if (props.defaultValue) {
      props.onChanged(props.defaultValue);
    }
  }, [props.defaultValue]); 
  
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const result = await fetch('components/input.ndi/sources')
        if (isMounted.current && result.ok && result.body) {
          const sources = await result.json() as NdiSource[];
          const newSources = sources.map((o: { name: string }) => ({
            value: o.name,
            label: o.name,
          }));
          if (props.defaultValue !== undefined && newSources.find(({value}) => value == props.defaultValue) === undefined) {
            newSources.push({value: props.defaultValue, label: props.defaultValue});
          }
          setSources(newSources);
          setLoading(false);
        } else {
          const text = await result.text();
          throw new Error(text);
        }
      } catch (err) {
        console.error(err);
      }
    }

    fetchSources().catch(console.error);

    const interval = setInterval(() => {fetchSources().catch(console.error)}, 500);

    return () => {
      isMounted.current = false;
      clearInterval(interval); 
    };
  }, [props.defaultValue])

  const classNames = useMemo(
    () => ({
      control: () => "bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded focus:ring-blue-500 focus:border-blue-500 p-1 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500", 
      singleValue: () => "node-edit-select-input",
      option: () => "node-edit-select-input",
      menu: () => "bg-gray-50 dark:bg-gray-700 p-1"
    }),
    []
  );

  return <>
    {loading ?
      <div>Loading...</div>
    :
    <CreatableSelect
      options={sources}
      value={inputValue ? { value: inputValue, label: inputValue } : null}
      isClearable
      onChange={(selected) => {
        const newValue = selected ? selected.value : "";
        setInputValue(newValue);
        props.onChanged(newValue);
      }}
      onCreateOption={(newInput: string) => {
        const newOption = { value: newInput, label: newInput };
        setSources((prev) => [...prev, newOption]);
        setInputValue(newInput);
        props.onChanged(newInput);
      }}
      placeholder="Select or type..."
      classNames={classNames}
      unstyled={true}
    />
    }
    </>;
}

export default SourceSelection;

