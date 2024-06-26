import { useEffect, useRef, useState } from "react";

type CodecEditorProps<Codec> = {
  defaultValue?: Codec,
  id: string,
  onChanged: (value: Codec) => void
}

export default function CodecEditor<Codec>(props: CodecEditorProps<Codec>) {
  useEffect(() => { if (props.defaultValue) props.onChanged(props.defaultValue); }, [props.defaultValue]);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const [value, setValue] = useState(props.defaultValue);

  useEffect(() => {
    if (textAreaRef.current) {
      const target = textAreaRef.current;
      target.style.height = ""; target.style.height = target.scrollHeight + "px";
    }
  }, [])

  return <textarea
    ref={textAreaRef}
    className="w-full min-h-fit dark:text-white dark:bg-black"
    onChange={(e) => {
      const target = e.currentTarget;
      try {
        const codec = JSON.parse(target.value);
        setValue(codec);
        props.onChanged(codec)
      } catch (e) {
        // TODO: Stuff
      }
    }}
    defaultValue={JSON.stringify(value, undefined, 2)}></textarea>
}
