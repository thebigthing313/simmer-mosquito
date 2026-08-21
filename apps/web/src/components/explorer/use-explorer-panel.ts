import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { type MapInset, NO_MAP_INSET } from '../map/map-inset';

/** Gap between the panel and the map edge, and between the panel and the controls. */
const PANEL_EDGE = 16;
/** The panel's width on a wide viewport. Wide enough for a row's title and badges. */
const PANEL_WIDTH = 380;
/** How much of the map the docked sheet covers on a narrow one, edge gap included. */
const PANEL_PEEK = 260;
/** The gap under the docked sheet, matching `bottom-3`. */
const SHEET_EDGE = 12;
/** Below this the panel docks to the bottom: a 380px column would be most of the screen. */
const NARROW_QUERY = '(max-width: 767px)';

export interface ExplorerPanel {
	readonly isCollapsed: boolean;
	readonly setCollapsed: (collapsed: boolean) => void;
	/** True where the panel docks to the bottom as a sheet rather than a side column. */
	readonly isNarrow: boolean;
	/** The width in px the panel occupies while expanded, for its own layout. */
	readonly width: number;
	/** The height in px the docked sheet stands at on a narrow viewport. */
	readonly peek: number;
	/** How much of the map the panel is covering right now. See {@link MapInset}. */
	readonly inset: MapInset;
}

/**
 * The results panel's own state, and the one fact the map needs to know about it.
 *
 * The collapse flag is component state rather than a search param on purpose:
 * the URL already carries the filter set, which is the thing a reader hands to a
 * colleague, and a link that also carried "I had the panel shut" would open on a
 * map with no results on it.
 *
 * The route calls this rather than the frame, because the selection fly-to runs
 * above the frame and needs the same inset the frame gives the canvas. One value,
 * one owner, and no explorer computing it for itself.
 */
export function useExplorerPanel(): ExplorerPanel {
	const [isCollapsed, setCollapsed] = useState(false);
	const isNarrow = useMediaQuery(NARROW_QUERY);

	const inset = useMemo<MapInset>(() => {
		// Collapsed, the panel is a pill in a corner. It covers a few hundred square
		// pixels of basemap and nothing the camera should steer around.
		if (isCollapsed) {
			return NO_MAP_INSET;
		}
		return isNarrow
			? { ...NO_MAP_INSET, bottom: PANEL_PEEK }
			: { ...NO_MAP_INSET, left: PANEL_EDGE + PANEL_WIDTH };
	}, [isCollapsed, isNarrow]);

	return {
		isCollapsed,
		setCollapsed,
		isNarrow,
		width: PANEL_WIDTH,
		peek: PANEL_PEEK - SHEET_EDGE,
		inset,
	};
}

/**
 * Whether a media query matches, kept in sync with the viewport.
 *
 * Guarded on `matchMedia` existing: the frame renders under jsdom in tests and
 * on a server-rendered first paint, neither of which has one, and a wide layout
 * is the right thing to assume when nobody has said otherwise.
 */
function useMediaQuery(query: string): boolean {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const list = globalThis.matchMedia?.(query);
			if (list === undefined) {
				return () => undefined;
			}
			list.addEventListener('change', onChange);
			return () => list.removeEventListener('change', onChange);
		},
		[query],
	);

	return useSyncExternalStore(
		subscribe,
		() => globalThis.matchMedia?.(query).matches ?? false,
		() => false,
	);
}
