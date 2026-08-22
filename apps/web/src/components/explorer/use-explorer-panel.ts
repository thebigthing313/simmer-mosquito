import { type RefCallback, useCallback, useMemo, useState } from 'react';
import { type MapInset, NO_MAP_INSET } from '../map/map-inset';

/** Gap between the panel and the map edge, and between the panel and the controls. */
const PANEL_EDGE = 16;
/** The panel's width on a wide stage. Wide enough for a row's title and badges. */
const PANEL_WIDTH = 380;
/** The gap under the docked sheet, matching `bottom-3`. */
const SHEET_EDGE = 12;
/** Map left over beside the panel before a side column stops being worth it. */
const MIN_MAP_WIDTH = 320;
/**
 * The share of the stage the docked sheet stands at.
 *
 * A share rather than a height, because an explorer stacks as many filter
 * controls as its records need and a fixed peek is a number that is right for
 * one of them. Declared here rather than as a class on the panel so the height
 * and the map's inset cannot disagree.
 */
const SHEET_STAGE_FRACTION = 0.7;
/**
 * Below this the panel docks to the bottom as a sheet.
 *
 * Measured against the map stage rather than the window, because the workspace
 * shell takes several hundred pixels of the window before the stage begins. A
 * window query says "wide" at sizes where the side column would leave a sliver
 * of map, and it also lets the fit margin ({@link useMapExtentFit}) exceed the
 * canvas width, which is a frame Mapbox cannot compute at all.
 */
const NARROW_STAGE_WIDTH = PANEL_EDGE + PANEL_WIDTH + MIN_MAP_WIDTH;

export interface ExplorerPanel {
	readonly isCollapsed: boolean;
	readonly setCollapsed: (collapsed: boolean) => void;
	/** True where the panel docks to the bottom as a sheet rather than a side column. */
	readonly isNarrow: boolean;
	/** The width in px the panel occupies while expanded, for its own layout. */
	readonly width: number;
	/** The height in px the docked sheet stands at. Only read while narrow. */
	readonly sheetHeight: number;
	/** How much of the map the panel is covering right now. See {@link MapInset}. */
	readonly inset: MapInset;
	/** Attach to the map stage. Its size decides the layout and the sheet's height. */
	readonly stageRef: RefCallback<HTMLElement>;
}

/**
 * The results panel's own state, and the one fact the map needs to know about it.
 *
 * The collapse flag is component state rather than a search param on purpose:
 * the URL already carries the filter set, which is the thing a reader hands to a
 * colleague, and a link that also carried "I had the panel shut" would open on a
 * map with no results on it.
 *
 * The route calls this rather than the frame, because a route reads the inset to
 * place its own chrome (a focus card) over the same map. One value, one owner,
 * and no explorer computing it for itself.
 */
export function useExplorerPanel(): ExplorerPanel {
	const [isCollapsed, setCollapsed] = useState(false);
	const [stageRef, stage] = useMeasuredBox();

	const isNarrow = stage !== null && stage.width < NARROW_STAGE_WIDTH;
	// Both the sheet's height and the inset come off the stage, so the map is
	// never told about a height the panel has not taken yet.
	const sheetHeight = stage === null ? 0 : Math.round(stage.height * SHEET_STAGE_FRACTION);

	const inset = useMemo<MapInset>(() => {
		// Collapsed, the panel is a pill in a corner. It covers a few hundred square
		// pixels of basemap and nothing the camera should steer around.
		if (isCollapsed) {
			return NO_MAP_INSET;
		}
		return isNarrow
			? { ...NO_MAP_INSET, bottom: sheetHeight + SHEET_EDGE }
			: { ...NO_MAP_INSET, left: PANEL_EDGE + PANEL_WIDTH };
	}, [isCollapsed, isNarrow, sheetHeight]);

	return { isCollapsed, setCollapsed, isNarrow, width: PANEL_WIDTH, sheetHeight, inset, stageRef };
}

interface MeasuredBox {
	readonly width: number;
	readonly height: number;
}

/**
 * An element's rendered size, kept current as it resizes.
 *
 * Null until the first observation, and callers read that as "not measured yet"
 * rather than "zero". A layout chosen from an unmeasured box would flash the
 * wrong one on every first paint.
 */
function useMeasuredBox(): [RefCallback<HTMLElement>, MeasuredBox | null] {
	const [box, setBox] = useState<MeasuredBox | null>(null);

	const record = useCallback((width: number, height: number) => {
		setBox((current) =>
			current !== null && current.width === width && current.height === height
				? current
				: { width, height },
		);
	}, []);

	const ref = useCallback(
		(element: HTMLElement | null) => {
			if (element === null) {
				return;
			}
			// Read once here rather than waiting for the observer's first delivery.
			// ResizeObserver reports after layout and before paint, so a document
			// that has not painted yet — a background tab, a hidden pane — never
			// hears from it, and a layout chosen from no measurement would flash the
			// wrong one on the first frame everywhere else.
			const rect = element.getBoundingClientRect();
			record(rect.width, rect.height);

			if (typeof ResizeObserver === 'undefined') {
				return;
			}
			const observer = new ResizeObserver((entries) => {
				const box = entries[0]?.contentRect;
				if (box !== undefined) {
					record(box.width, box.height);
				}
			});
			observer.observe(element);
			return () => observer.disconnect();
		},
		[record],
	);

	return [ref, box];
}
