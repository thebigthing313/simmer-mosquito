import {
	type DrawVertexRef,
	insertRingVertex,
	moveRingVertex,
	type PlanarPath,
	type PlanarPosition,
	removeRingVertex,
} from '@simmer-mosquito/mapping';
import type { Dispatch, SetStateAction } from 'react';
import type { DrawSketchTool, Mode } from '../../components/map/draw-parts';

/**
 * The gestures an open edit answers to: the three that move a corner, the pick
 * Delete reads, and the two sketch tools. Each ring change costs one Undo step.
 */
export function useDrawVertexActions(setMode: Dispatch<SetStateAction<Mode>>) {
	const selectVertex = (vertex: DrawVertexRef | null) => {
		setMode((previous) =>
			previous.kind === 'edit' ? { ...previous, selected: vertex } : previous,
		);
	};

	const changeRings = (
		change: (rings: readonly PlanarPath[]) => readonly PlanarPath[] | null,
		selected: (rings: readonly PlanarPath[]) => DrawVertexRef | null,
	) => {
		setMode((previous) => {
			if (previous.kind !== 'edit') {
				return previous;
			}
			const rings = change(previous.rings);
			if (rings === null) {
				return previous;
			}
			return {
				...previous,
				rings,
				history: [...previous.history, previous.rings],
				selected: selected(rings),
			};
		});
	};

	const moveVertex = (vertex: DrawVertexRef, position: PlanarPosition) => {
		changeRings(
			(rings) => moveRingVertex(rings, vertex, position),
			() => vertex,
		);
	};

	// The new vertex is picked, so clicking an edge and pressing Delete undoes
	// itself rather than removing whichever corner happened to be picked before.
	const insertVertex = (edge: DrawVertexRef, position: PlanarPosition) => {
		changeRings(
			(rings) => insertRingVertex(rings, edge, position),
			() => ({ ring: edge.ring, vertex: edge.vertex + 1 }),
		);
	};

	// Nothing stays picked: every index after the one dropped has shifted, so a
	// pick kept here would name a different corner than the one on screen did.
	const deleteVertex = (vertex: DrawVertexRef) => {
		changeRings(
			(rings) => removeRingVertex(rings, vertex),
			() => null,
		);
	};

	// A point has one corner and no boundary a line could cross, so there is
	// nothing here to sketch across. The pick goes because the vertex gestures are
	// off for as long as the sketch is open.
	const openSketch = (tool: DrawSketchTool) => {
		setMode((previous) =>
			previous.kind === 'edit' && previous.type !== 'Point'
				? { ...previous, selected: null, sketch: { tool, positions: [] } }
				: previous,
		);
	};
	const startReshape = () => openSketch('reshape');
	// Not refused here even where the record kind cannot hold two pieces. The
	// draft names that refusal and the toolbar says it, which is the only place
	// the user would find out why the tool did nothing.
	const startSplit = () => openSketch('split');

	// Not through `changeRings`: a sketch vertex changes no ring, and Undo pops it
	// one at a time rather than taking the whole sketch back at once.
	const sketchVertex = (position: PlanarPosition) => {
		setMode((previous) =>
			previous.kind === 'edit' && previous.sketch !== null
				? {
						...previous,
						sketch: {
							...previous.sketch,
							positions: [...previous.sketch.positions, position],
						},
					}
				: previous,
		);
	};

	return {
		selectVertex,
		moveVertex,
		insertVertex,
		deleteVertex,
		startReshape,
		startSplit,
		sketchVertex,
	};
}
