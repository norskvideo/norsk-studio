import { useEffect, useState } from "react";

type OrderInputProps = {
  defaultValue?: string[],
  id: string,
  onChanged: (value: string[]) => void
}

function OrderInput(props: OrderInputProps) {
  // This just makes sure our default value ends up in the form
  useEffect(() => { props.onChanged(props.defaultValue ?? []); }, [props.defaultValue]);

  const [value, setValue] = useState(props.defaultValue ?? []);

  if (value.length == 0) {
    return <p className="node-editor-helper-text">Sources will appear here when subscriptions have been added to this node</p>
  } else {
    return <div id={props.id}>
      <ul>
        {value.map((v, ix) => {
          return <li key={v} className="flex">
            <span className="node-editor-label flex-grow">{v}</span>
            {ix == 0 ? <></> : <svg onClick={moveUp(ix)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} className="w-4 h-6 shrink cursor-pointer stroke-gray-700 dark:stroke-gray-50">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75L12 3m0 0l3.75 3.75M12 3v18" />
            </svg>}
            {ix == value.length - 1 ? <></> : <svg onClick={moveDown(ix)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} className="w-4 h-6 shrink cursor-pointer stroke-gray-700 dark:stroke-gray-50">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25L12 21m0 0l-3.75-3.75M12 21V3" />
            </svg>}
          </li>
        })}
      </ul>
    </div >
  }

  function moveUp(ix: number) {
    return () => {
      const nv = [...value];
      nv[ix] = value[ix - 1];
      nv[ix - 1] = value[ix];
      setValue(nv);
      props.onChanged(nv);
    }
  }

  function moveDown(ix: number) {
    return () => {
      const nv = [...value];
      nv[ix + 1] = value[ix];
      nv[ix] = value[ix + 1];
      setValue(nv);
      props.onChanged(nv);
    }
  }
}

export default OrderInput;
