import type { CascadingSwitchState, CascadingSwitchConfig } from "./runtime";

const activeClasses = "active text-green-500 dark:text-green-300";
const availableClasses = "available text-green-500 dark:text-green-300";
const inactiveClasses = "inactive text-orange-500 dark:text-orange-300";

// It would be nice to do this
// but then we have to fight the server-side build stuff which does actually import this file
// even though it doesn't use it (presently)
//import _mycss from "./extra.css" assert { type: 'css'}

function InlineView({ state, config }: { state: CascadingSwitchState, config: CascadingSwitchConfig }) {
  return <>
    <h5>Sources</h5>
    <ul>
      {config.sources.map((s, i) =>
        state.activeSource == s ?
          <li key={i} className={activeClasses}>{s} &lt;--</li>
          : state.availableSources.includes(s)
            ? <li key={i} className={availableClasses}>{s} (available)</li>
            : <li key={i} className={inactiveClasses}>{s} (inactive)</li>
      )}
      <li key="fallback" className={state.activeSource == 'fallback' ? activeClasses : availableClasses}>fallback</li>
    </ul>
  </>
}

export default InlineView;
