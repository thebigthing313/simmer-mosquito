import type { PlanarPosition } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type Dispatch, type SetStateAction, useEffect } from 'react';
import type { MapDrawController } from '../../components/map/draw-controller';
import {
	type DrawDrag,
	type DrawGeometry,
	type DrawGeometryType,
	type DrawPartGeometry,
	type DrawTarget,
	finishedParts,
	landedSketch,
	type Mode,
	poppedTo,
	rejectPending,
	undoneEdit,
	vertexFloor,
} from '../../components/map/draw-parts';
import { isMapLive } from './use-mapbox-map';

/**
 * The five controls that open, close and take back a draw, and the point request
 * the address subform makes. Each leaves nothing of the last draw behind.
 */
export function useDrawSession({
	map,
	applyParts,
	highlightPart,
	cursorRef,
	dragRef,
	modeRef,
	valueRef,
	verticesRef,
	onChangeRef,
	finishRef,
	setMode,
	setVertices,
}: {
	readonly map: MapboxMap | null;
	readonly applyParts: (target: DrawTarget, parts: readonly DrawPartGeometry[]) => void;
	readonly highlightPart: (index: number | null) => void;
	readonly cursorRef: { current: PlanarPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly modeRef: { current: Mode };
	readonly valueRef: { current: DrawGeometry | null };
	readonly verticesRef: { current: readonly PlanarPosition[] };
	readonly onChangeRef: { current: (value: DrawGeometry | null) => void };
	readonly finishRef: { current: () => void };
	readonly setMode: Dispatch<SetStateAction<Mode>>;
	readonly setVertices: Dispatch<SetStateAction<readonly PlanarPosition[]>>;
}): Pick<MapDrawController, 'start' | 'cancel' | 'commit' | 'undo' | 'finish' | 'requestPoint'> {
	// Nothing of the last draw survives a mode change: a pending point request is
	// told it was superseded, and the cursor, the grabbed vertex and the placed
	// vertices all go.
	const clear = () => {
		rejectPending(modeRef.current);
		cursorRef.current = null;
		dragRef.current = null;
		setVertices([]);
	};

	const start = (type: DrawGeometryType) => {
		// Starting a fresh draw clears every committed part, at any part count, so
		// the map shows exactly what the in-progress shape will become.
		clear();
		highlightPart(null);
		onChangeRef.current(null);
		setMode({ kind: 'draw', type, target: { kind: 'replace' } });
	};

	const cancel = () => {
		clear();
		setMode({ kind: 'idle' });
	};

	const commit = (geometry: DrawGeometry | null) => {
		clear();
		onChangeRef.current(geometry);
		setMode({ kind: 'idle' });
	};

	const undo = () => {
		if (modeRef.current.kind === 'edit') {
			setMode(undoneEdit);
			return;
		}
		setVertices((previous) => poppedTo(previous, vertexFloor(modeRef.current)));
	};

	// An open reshape is what Finish lands, and the Finish after that commits the
	// part. Two presses rather than one because the reshaped outline is still a
	// draft the other gestures can work on, the way a moved vertex is. A split
	// takes one press: two pieces are not a draft this mode can hold.
	const finish = () => {
		const current = modeRef.current;
		if (current.kind === 'edit' && current.sketch?.tool === 'reshape') {
			cursorRef.current = null;
			setMode(landedSketch);
			return;
		}
		const finished = finishedParts(current, valueRef.current, verticesRef.current);
		if (finished !== null) {
			applyParts(finished.target, finished.parts);
		}
	};
	// Written in an effect rather than during render, which is what the React
	// Compiler permits. The two readers are keyboard handlers registered inside
	// effects, so they read it after this commit either way.
	useEffect(() => {
		finishRef.current = finish;
	});

	const requestPoint = (_prompt?: string) =>
		new Promise<DrawGeometry & { readonly type: 'Point' }>((resolve, reject) => {
			if (!isMapLive(map)) {
				reject(new Error('The map is not ready yet.'));
				return;
			}
			clear();
			setMode({ kind: 'point', resolve, reject });
		});

	return { start, cancel, commit, undo, finish, requestPoint };
}
