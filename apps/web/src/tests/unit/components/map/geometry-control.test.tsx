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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeometryControl } from '../../../../components/map/geometry-control';
import type { DrawPartGeometry, MapDrawController } from '../../../../components/map/use-map-draw';
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

function fakeController(): MapDrawController {
	return {
		isDrawing: false,
		isAddingPart: false,
		isRequestingPoint: false,
		drawType: null,
		vertexCount: 0,
		canFinish: false,
		start: vi.fn(),
		startPart: vi.fn(),
		removePart: vi.fn(),
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
}: {
	readonly parts: readonly DrawPartGeometry[];
	readonly geometryKind?: 'habitat' | 'notificationRegistration';
}) {
	const controller = fakeController();
	const geometry = geometryFromParts(parts);
	render(
		<GeometryControl
			controller={controller}
			geometry={geometry}
			geometryKind={geometryKind}
			geometryType="Polygon"
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

	it('hides Add piece before the first piece is drawn', () => {
		renderControl({ parts: [] });

		expect(screen.queryByText('Add piece')).toBeNull();
		expect(screen.getByText('No geometry drawn yet.')).toBeDefined();
	});
});
