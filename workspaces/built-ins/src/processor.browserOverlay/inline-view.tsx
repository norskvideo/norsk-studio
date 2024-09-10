import { BrowserOverlayState, BrowserOverlayConfig } from "./runtime";

function InlineView({ state, config }: { state: BrowserOverlayState, config: BrowserOverlayConfig }) {
	return <div id={`browser-overlay-${config.id}`}>
		<div className="w-64 grid grid-cols-[min-content,1fr] gap-2">
			<div>URL:</div>
			<div className="truncate">{state.currentUrl}</div>

			<div>Enabled:</div>
			<div>
				<label className="inline-flex items-center cursor-pointer">
					<input type="checkbox" checked={state.enabled} disabled className="sr-only peer" />
					<div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
				</label>
			</div>
		</div>
	</div>
}

export default InlineView;
