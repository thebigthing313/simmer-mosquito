/** @vitest-environment jsdom */
/**
 * The piece list and the Add piece button.
 *
 * Two of these guard rules the spec states in the negative, and both are quiet
 * when they break. The list replaces the summary line at two pieces and only at
 * two, so a one-piece shape has to keep rendering exactly what it always did.
 * Add piece is hidden where the record cannot store the multi shape, so a
 * Notification Registration must never offer it: it would draw fine and refuse
 * on save.
 */
import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawToolbar, GeometryControl } from '../../../../components/map/geometry-control';
import type {
	DrawGeometryType,
	DrawPartGeometry,
	MapDrawController,
} from '../../../../components/map/use-map-draw';
import { geometryFromParts } from '../../../../components/map/use-map-draw';

afterEach(cleanup);

function square(west: number): DrawPartGeometry {
	return {
		type: 'Polygon',
		coordinates: [
			[
				[west, 35],
				[west, 36],
				[west + 1, 36],
				[west, 35],
			],
		],
	};
}

/** The same area with one hole cut out of it. */
function squareWithHole(west: number): DrawPartGeometry {
	return {
		type: 'Polygon',
		coordinates: [
			[
				[west, 35],
				[west, 38],
				[west + 3, 38],
				[west + 3, 35],
				[west, 35],
			],
			[
				[west + 1, 36],
				[west + 1, 37],
				[west + 2, 37],
				[west + 2, 36],
				[west + 1, 36],
			],
		],
	};
}

function fakeController(): MapDrawController {
	return {
		isDrawing: false,
		isAddingPart: false,
		isRequestingPoint: false,
		drawType: null,
		vertexCount: 0,
		canFinish: false,
		canUndo: false,
		holeDraft: null,
		continuedPart: null,
		start: vi.fn(),
		startPart: vi.fn(),
		startHole: vi.fn(),
		continuePart: vi.fn(),
		removePart: vi.fn(),
		removeHole: vi.fn(),
		highlightPart: vi.fn(),
		zoomToPart: vi.fn(),
		finish: vi.fn(),
		cancel: vi.fn(),
		undo: vi.fn(),
		commit: vi.fn(),
		requestPoint: vi.fn(),
	};
}

function renderControl({
	parts,
	geometryKind = 'habitat',
	geometryType = 'Polygon',
}: {
	readonly parts: readonly DrawPartGeometry[];
	readonly geometryKind?: OwnedGeometryKind;
	readonly geometryType?: DrawGeometryType;
}) {
	const controller = fakeController();
	const geometry = geometryFromParts(parts);
	render(
		<GeometryControl
			controller={controller}
			geometry={geometry}
			geometryKind={geometryKind}
			geometryType={geometryType}
			onClear={vi.fn()}
			onDraw={vi.fn()}
		/>,
	);
	return controller;
}

describe('GeometryControl', () => {
	it('keeps the summary line at one piece', () => {
		renderControl({ parts: [square(-90)] });

		expect(screen.getByText('Polygon · 3 vertices')).toBeDefined();
		expect(screen.queryByText('Piece 1 · 3 vertices')).toBeNull();
	});

	it('replaces the summary line with the piece list at two', () => {
		renderControl({ parts: [square(-90), square(-80)] });

		expect(screen.queryByText('Polygon · 3 vertices')).toBeNull();
		expect(screen.getByText('Polygon · 2 pieces')).toBeDefined();
		expect(screen.getByText('Piece 1 · 3 vertices')).toBeDefined();
		expect(screen.getByText('Piece 2 · 3 vertices')).toBeDefined();
	});

	it('removes the piece the row names', () => {
		const controller = renderControl({ parts: [square(-90), square(-80)] });

		fireEvent.click(screen.getByLabelText('Remove piece 2'));

		expect(controller.removePart).toHaveBeenCalledWith(1);
	});

	// Nothing caps the piece count, so a long shape folds rather than truncating.
	it('shows eight rows and asks before showing the rest', () => {
		renderControl({ parts: Array.from({ length: 10 }, (_, index) => square(-90 + index * 5)) });

		expect(screen.queryByText('Piece 9 · 3 vertices')).toBeNull();

		fireEvent.click(screen.getByText('Show all 10'));

		expect(screen.getByText('Piece 10 · 3 vertices')).toBeDefined();
	});

	it('offers Add piece where the record can store a multi shape', () => {
		const controller = renderControl({ parts: [square(-90)] });

		fireEvent.click(screen.getByText('Add piece'));

		expect(controller.startPart).toHaveBeenCalled();
	});

	it('hides Add piece where the record cannot store one', () => {
		renderControl({ parts: [square(-90)], geometryKind: 'notificationRegistration' });

		expect(screen.queryByText('Add piece')).toBeNull();
	});

	// The gate is what the record stores, not which tool is selected. A
	// Notification Registration on the point tool still offers the file, because
	// it stores an area too and adopting one moves the toggle.
	it('offers the file shortcut wherever the record stores a shape a file carries', () => {
		renderControl({
			parts: [],
			geometryKind: 'notificationRegistration',
			geometryType: 'Point',
		});

		expect(
			screen.getByLabelText('Fill this geometry from a KML, KMZ, or GeoJSON file'),
		).toBeDefined();
	});

	// No import surface has ever produced a point, so a point-only record has
	// nothing a file could fill.
	it('hides the file shortcut on a record that stores only a point', () => {
		renderControl({ parts: [], geometryKind: 'serviceRequest', geometryType: 'Point' });

		expect(
			screen.queryByLabelText('Fill this geometry from a KML, KMZ, or GeoJSON file'),
		).toBeNull();
	});

	it('hides Add piece before the first piece is drawn', () => {
		renderControl({ parts: [] });

		expect(screen.queryByText('Add piece')).toBeNull();
		expect(screen.getByText('No geometry drawn yet.')).toBeDefined();
	});

	it('cuts a hole into the only piece from the control', () => {
		const controller = renderControl({ parts: [square(-90)] });

		fireEvent.click(screen.getByText('Cut hole'));

		expect(controller.startHole).toHaveBeenCalledWith(0);
	});

	// At two pieces the button would have to guess which one was meant, so it
	// moves onto the rows, where the piece is the row it sits on.
	it('moves Cut hole onto the rows at two pieces', () => {
		const controller = renderControl({ parts: [square(-90), square(-80)] });

		expect(screen.queryByText('Cut hole')).toBeNull();
		fireEvent.click(screen.getByLabelText('Cut a hole in piece 2'));

		expect(controller.startHole).toHaveBeenCalledWith(1);
	});

	it('offers no hole on a shape that has no inside', () => {
		render(
			<GeometryControl
				controller={fakeController()}
				geometry={{ type: 'Point', coordinates: [-90, 35] }}
				geometryKind="habitat"
				geometryType="Point"
				onClear={vi.fn()}
				onDraw={vi.fn()}
			/>,
		);

		expect(screen.queryByText('Cut hole')).toBeNull();
	});

	it('counts the holes in the line that describes a piece', () => {
		renderControl({ parts: [squareWithHole(-90)] });

		expect(screen.getByText('Polygon · 4 vertices, 1 hole')).toBeDefined();
	});

	it('lists a hole under its piece and removes it on its own', () => {
		const controller = renderControl({ parts: [squareWithHole(-90)] });

		expect(screen.getByText('Hole 1 · 4 vertices')).toBeDefined();
		fireEvent.click(screen.getByLabelText('Remove hole 1'));

		expect(controller.removeHole).toHaveBeenCalledWith(0, 0);
	});

	it('continues the only piece from the control', () => {
		const controller = renderControl({ parts: [square(-90)] });

		fireEvent.click(screen.getByText('Continue'));

		expect(controller.continuePart).toHaveBeenCalledWith(0);
	});

	// At two pieces the button would have to guess which one was meant, so it
	// moves onto the rows, the way Cut hole does.
	it('moves Continue onto the rows at two pieces', () => {
		const controller = renderControl({ parts: [square(-90), square(-80)] });

		expect(screen.queryByText('Continue')).toBeNull();
		fireEvent.click(screen.getByLabelText('Continue piece 2'));

		expect(controller.continuePart).toHaveBeenCalledWith(1);
	});

	it('offers nothing to continue on a point', () => {
		render(
			<GeometryControl
				controller={fakeController()}
				geometry={{ type: 'Point', coordinates: [-90, 35] }}
				geometryKind="habitat"
				geometryType="Point"
				onClear={vi.fn()}
				onDraw={vi.fn()}
			/>,
		);

		expect(screen.queryByText('Continue')).toBeNull();
	});

	it('leaves the point pieces of a multi shape with nothing to continue', () => {
		renderControl({
			parts: [
				{ type: 'Point', coordinates: [-90, 35] },
				{ type: 'Point', coordinates: [-80, 35] },
			],
			geometryType: 'Point',
		});

		expect(screen.queryByLabelText('Continue piece 1')).toBeNull();
		expect(screen.queryByLabelText('Continue piece 2')).toBeNull();
	});

	it('names the piece a hole belongs to once there are several', () => {
		const controller = renderControl({ parts: [square(-95), squareWithHole(-90)] });

		fireEvent.click(screen.getByLabelText('Remove hole 1 from piece 2'));

		expect(controller.removeHole).toHaveBeenCalledWith(1, 0);
	});
});

describe('DrawToolbar', () => {
	function renderToolbar(holeDraft: MapDrawController['holeDraft'], vertexCount = 4) {
		render(
			<DrawToolbar
				controller={{ ...fakeController(), holeDraft, isDrawing: true, vertexCount }}
				geometryType="Polygon"
			/>,
		);
	}

	it('names the piece a hole has to stay inside', () => {
		renderToolbar({ partNumber: 2, partCount: 3, problem: 'escapes' });

		expect(screen.getByText('The hole must stay inside piece 2.')).toBeDefined();
	});

	it('says when a hole would leave nothing of its piece', () => {
		renderToolbar({ partNumber: 2, partCount: 3, problem: 'swallows' });

		expect(screen.getByText('The hole leaves nothing of piece 2.')).toBeDefined();
	});

	// At one piece there is no row list, so a piece number names nothing the user
	// has read.
	it('leaves the number out where there is only one piece', () => {
		renderToolbar({ partNumber: 1, partCount: 1, problem: 'escapes' });

		expect(screen.getByText('The hole must stay inside the area.')).toBeDefined();
	});

	it('prompts for the first vertex of a hole', () => {
		renderToolbar({ partNumber: 1, partCount: 1, problem: null }, 0);

		expect(screen.getByText('Click the map to start the hole.')).toBeDefined();
	});

	it('names the piece being continued once there are several', () => {
		render(
			<DrawToolbar
				controller={{
					...fakeController(),
					continuedPart: { partNumber: 2, partCount: 3 },
					isDrawing: true,
					vertexCount: 5,
				}}
				geometryType="Polygon"
			/>,
		);

		expect(
			screen.getByText('Continuing piece 2 · 5 vertices · double-click or Finish to complete.'),
		).toBeDefined();
	});

	// A continuation opens with the piece's own vertices placed, so a count above
	// zero is not what says Undo has anything to pop.
	it('offers no Undo until a continuation has added a vertex', () => {
		render(
			<DrawToolbar
				controller={{
					...fakeController(),
					continuedPart: { partNumber: 1, partCount: 1 },
					isDrawing: true,
					vertexCount: 4,
				}}
				geometryType="Polygon"
			/>,
		);

		expect(screen.getByText('Undo').closest('button')?.disabled).toBe(true);
	});
});
