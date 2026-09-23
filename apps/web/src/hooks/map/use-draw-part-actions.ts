import { type OwnedGeometryKind, ownedGeometryAllowsParts } from '@simmer-mosquito/domain';
import type { PlanarPosition } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import {
	continuedVertices,
	type DrawDrag,
	type DrawGeometry,
	type DrawPartGeometry,
	type DrawTarget,
	drawHoles,
	drawParts,
	geometryFromParts,
	type Mode,
	rejectPending,
	ringsOfPart,
	sameDrawGeometry,
	withParts,
} from '../../components/map/draw-parts';
import { fitMapToGeometry } from '../../components/map/fit-map-to-geometry';
import { isMapLive } from './use-mapbox-map';

/**
 * The actions on the committed parts: adding one, dropping one, and picking one
 * out on the map, sharing the highlighted index.
 */
export function useDrawPartActions({
	map,
	geometryKind,
	cursorRef,
	dragRef,
	modeRef,
	valueRef,
	onChangeRef,
	setMode,
	setVertices,
}: {
	readonly map: MapboxMap | null;
	readonly geometryKind: OwnedGeometryKind | undefined;
	readonly cursorRef: { current: PlanarPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly modeRef: { current: Mode };
	readonly valueRef: { current: DrawGeometry | null };
	readonly onChangeRef: { current: (value: DrawGeometry | null) => void };
	readonly setMode: (next: Mode) => void;
	readonly setVertices: (next: readonly PlanarPosition[]) => void;
}) {
	const [highlightedPart, setHighlightedPart] = useState<number | null>(null);
	const highlightedRef = useRef(highlightedPart);
	// Written in an effect rather than during render, which is what the React
	// Compiler permits. `repaint` is the only reader and runs from an effect or a
	// Mapbox event, so it reads the same value it did before.
	useEffect(() => {
		highlightedRef.current = highlightedPart;
	});

	// The one place a finished draw lands. `replace` throws the committed parts
	// away, `part` appends to them, `hole` puts back the one part it names with
	// its new ring, and the shape that comes out is whatever `geometryFromParts`
	// says the count makes it.
	//
	// A finish that leaves the shape where it was reports nothing. Continuing a
	// piece and pressing Finish without placing a corner used to publish the same
	// geometry back, and the form reads any publication as a redraw. On a habitat
	// a redraw names `updateHabitatLocation`, which sits at the manager floor, so
	// a collector's details-only save was refused for a shape nobody moved (#472).
	// The compare is over the geometry about to go out, so a ring closed on Finish
	// matches the ring it was seeded from, and it runs once per Finish rather than
	// on any render.
	const applyParts = (target: DrawTarget, parts: readonly DrawPartGeometry[]) => {
		const existing = drawParts(valueRef.current);
		const next = geometryFromParts(withParts(existing, target, parts));
		const unchanged = sameDrawGeometry(next, valueRef.current);
		cursorRef.current = null;
		dragRef.current = null;
		setVertices([]);
		setMode({ kind: 'idle' });
		// The draw still ends: the mode, the cursor and the vertices go either
		// way, and only the change notification is withheld.
		if (!unchanged) {
			onChangeRef.current(next);
		}
	};

	// The base shape comes off the committed parts rather than off the toggle:
	// they are the thing being added to, and a toggle change has already cleared
	// them.
	const startPart = () => {
		const base = drawParts(valueRef.current)[0]?.type;
		if (base === undefined) {
			return;
		}
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		setHighlightedPart(null);
		setMode({ kind: 'draw', type: base, target: { kind: 'part' } });
	};

	// Refused here rather than left to whichever button happens to be hidden. A
	// part that is not an area has no inside, and the containment check would read
	// its coordinate pair as a ring and call every vertex of the hole escaped.
	const startHole = (index: number) => {
		const part = drawParts(valueRef.current)[index];
		if (part?.type !== 'Polygon') {
			return;
		}
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		setHighlightedPart(null);
		setMode({ kind: 'draw', type: 'Polygon', target: { kind: 'hole', partIndex: index } });
	};

	// The part stays committed through the continuation, so Cancel and Escape put
	// it back with nothing to restore: the draw is abandoned and the part is still
	// where it was. What is committed is what the map draws, so the draft takes
	// over drawing this one part while the mode is on it.
	const continuePart = (index: number) => {
		const part = drawParts(valueRef.current)[index];
		const seeded = part === undefined ? null : continuedVertices(part);
		if (part === undefined || seeded === null) {
			return;
		}
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices(seeded);
		setHighlightedPart(null);
		setMode({
			kind: 'draw',
			type: part.type,
			target: { kind: 'continue', partIndex: index, seeded: seeded.length },
		});
	};

	// Every ring the part has, not just its outline: a hole is edited with the same
	// three gestures as the shell, so all of them are seeded together and go back
	// together. The part stays committed through the edit, so Cancel and Escape put
	// it back with nothing to restore, holes included.
	const editPart = (index: number) => {
		const part = drawParts(valueRef.current)[index];
		if (part === undefined) {
			return;
		}
		rejectPending(modeRef.current);
		cursorRef.current = null;
		dragRef.current = null;
		setVertices([]);
		setHighlightedPart(null);
		setMode({
			kind: 'edit',
			type: part.type,
			partIndex: index,
			rings: ringsOfPart(part),
			history: [],
			selected: null,
			sketch: null,
			allowsParts: geometryKind !== undefined && ownedGeometryAllowsParts(geometryKind, part.type),
		});
	};

	const removePart = (index: number) => {
		setHighlightedPart(null);
		onChangeRef.current(
			geometryFromParts(drawParts(valueRef.current).filter((_, at) => at !== index)),
		);
	};

	// `holeIndex` counts holes, not rings, so nothing outside this file has to
	// know that ring zero is the outline.
	const removeHole = (partIndex: number, holeIndex: number) => {
		const parts = drawParts(valueRef.current);
		const part = parts[partIndex];
		if (part?.type !== 'Polygon' || drawHoles(part)[holeIndex] === undefined) {
			return;
		}
		const rings = part.coordinates.filter((_, at) => at !== holeIndex + 1);
		onChangeRef.current(
			geometryFromParts(
				parts.map((at, index) =>
					index === partIndex ? { type: 'Polygon', coordinates: rings } : at,
				),
			),
		);
	};

	const zoomToPart = (index: number) => {
		const part = drawParts(valueRef.current)[index];
		if (part === undefined || !isMapLive(map)) {
			return;
		}
		fitMapToGeometry(map, part);
	};

	return {
		applyParts,
		continuePart,
		editPart,
		highlightedPart,
		highlightedRef,
		highlightPart: setHighlightedPart,
		removeHole,
		removePart,
		startHole,
		startPart,
		zoomToPart,
	};
}
