/**
 * How the Dashboard's last-7-days strip states each change, as a count or a
 * percentage, remembered in this browser. Returns the mode and a setter that
 * stores the choice; a blocked or empty store, or a value it does not know,
 * reads as the count.
 */

import { useState } from 'react';
import type { ChangeMode } from '../../components/dashboard/dashboard-data';

export const ACTIVITY_STRIP_CHANGE_MODE_KEY = 'simmer.dashboard.activity-strip.change-mode';

export function useActivityStripChangeMode(): readonly [ChangeMode, (next: ChangeMode) => void] {
	const [mode, setMode] = useState<ChangeMode>(readChangeMode);
	const choose = (next: ChangeMode) => {
		setMode(next);
		writeChangeMode(next);
	};
	return [mode, choose];
}

// Outside the hook, because the React Compiler cannot lower a try/catch
// inside a component or hook yet and would skip the whole hook.
function writeChangeMode(mode: ChangeMode): void {
	try {
		globalThis.localStorage?.setItem(ACTIVITY_STRIP_CHANGE_MODE_KEY, mode);
	} catch {
		// The choice holds for this visit only, which is where it was before.
	}
}

function readChangeMode(): ChangeMode {
	try {
		return globalThis.localStorage?.getItem(ACTIVITY_STRIP_CHANGE_MODE_KEY) === 'percent'
			? 'percent'
			: 'count';
	} catch {
		return 'count';
	}
}
