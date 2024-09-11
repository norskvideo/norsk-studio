import type { LadderRungDefinition } from "./runtime";

export default function (rung: LadderRungDefinition) {
  return (<div className="text-gray-900 dark:text-white">{rung.name}</div >)
}
