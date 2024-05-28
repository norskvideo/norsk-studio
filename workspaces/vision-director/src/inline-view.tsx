import type { MultiCameraSelectState, MultiCameraSelectConfig } from "./runtime";

const activeClasses = "active text-green-300 dark:text-green-300";
const availableClasses = "available text-green-300 dark:text-green-300";
const inactiveClasses = "inactive text-orange-300 dark:text-orange-300";

function InlineView({ state }: { state: MultiCameraSelectState, config: MultiCameraSelectConfig }) {
  return <>
    <h5>Sources</h5>
    <ul>
      {state.knownSources.map((s, i) =>
        state.activeSource.id == s.id && state.activeSource.key == s.key ?
          <li key={i} className={activeClasses}>{s.key ?? s.id} &lt;--</li>
          : state.availableSources.find((a) => a.id == s.id && a.key == s.key)
            ? <li key={i} className={availableClasses}>{s.key ?? s.id} (available)</li>
            : <li key={i} className={inactiveClasses}>{s.key ?? s.id} (inactive)</li>
      )}
    </ul>
  </>
}

export default InlineView;
