import type { SourceSwitchState, SourceSwitchConfig } from "./runtime";

const activeClasses = "active text-green-500 dark:text-green-300";
const availableClasses = "available text-green-500 dark:text-green-300";
const inactiveClasses = "inactive text-orange-500 dark:text-orange-300";

function InlineView({ state }: { state: SourceSwitchState, config: SourceSwitchConfig }) {
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
