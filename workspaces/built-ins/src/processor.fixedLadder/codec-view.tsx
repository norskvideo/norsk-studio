export default function CodecEditor(props: { width: number, height: number } | undefined) {
  // if (value.length == 0) {
  //   return <p className="node-editor-helper-text">Add some encode rungs!</p>
  // } else {
  //   return <div id={props.id}>
  //     { /* Multiselect dropdown here for enabling the rungs */}
  //   </div >
  // }
  return <div className="text-gray-900 dark:text-white">{props?.width}x{props?.height}</div>
}
