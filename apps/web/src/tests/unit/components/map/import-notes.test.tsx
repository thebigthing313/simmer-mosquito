/** @vitest-environment jsdom */
/**
 * What the two import surfaces say about what they are not offering.
 *
 * A refusal is a note rather than an absence, so these cases are really one
 * rule: every count the parser hands back has a sentence, and a clean file has
 * none of them. The noun rule is here too, because a dialog offering areas and
 * lines alike has no specific word to use.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeometryImportDialog } from '../../../../components/map/geometry-import-dialog';
import { ImportNotes, importRowSummary } from '../../../../components/map/import-notes';

afterEach(cleanup);

describe('ImportNotes', () => {
	it('renders nothing when the file gave up no refusals', () => {
		const { container } = render(
			<ImportNotes
				counts={{ projected: 0, multipart: 0, mixed: 0 }}
				noun={{ one: 'area', many: 'areas' }}
			/>,
		);

		expect(container.textContent).toBe('');
	});

	it('names a multipart refusal in the surface’s own noun', () => {
		render(
			<ImportNotes
				counts={{ projected: 0, multipart: 1, mixed: 0 }}
				noun={{ one: 'area', many: 'areas' }}
			/>,
		);

		expect(screen.getByText(/1 area has separate pieces and cannot be used here\./)).toBeDefined();
	});

	it('counts mixed geometry apart from everything else', () => {
		render(
			<ImportNotes
				counts={{ projected: 3, multipart: 2, mixed: 2 }}
				noun={{ one: 'area', many: 'areas' }}
			/>,
		);

		expect(screen.getByText(/2 areas have separate pieces/)).toBeDefined();
		expect(screen.getByText(/2 features hold mixed geometry and were skipped\./)).toBeDefined();
		expect(screen.getByText(/3 shapes use coordinates outside/)).toBeDefined();
	});
});

describe('importRowSummary', () => {
	const square: [number, number][] = [
		[0, 0],
		[0, 1],
		[1, 1],
		[1, 0],
		[0, 0],
	];

	it('counts vertices and leaves the piece count off a single-piece shape', () => {
		expect(importRowSummary({ type: 'Polygon', coordinates: [square] }, null)).toBe('4 vertices');
	});

	it('names the pieces of a multipart shape', () => {
		expect(
			importRowSummary({ type: 'MultiPolygon', coordinates: [[square], [square]] }, null),
		).toBe('2 pieces · 8 vertices');
	});

	it('says a label point was dropped, on a row that still imports', () => {
		expect(importRowSummary({ type: 'Polygon', coordinates: [square] }, 'labelPoint')).toBe(
			'4 vertices · label point dropped',
		);
	});

	it('spells one vertex singular', () => {
		expect(importRowSummary({ type: 'Point', coordinates: [0, 0] }, null)).toBe('1 vertex');
	});
});

describe('GeometryImportDialog', () => {
	function open(allowedTypes: Parameters<typeof GeometryImportDialog>[0]['allowedTypes']) {
		render(
			<GeometryImportDialog
				allowedTypes={allowedTypes}
				onOpenChange={vi.fn()}
				onSelect={vi.fn()}
				open
			/>,
		);
	}

	it('keeps the specific noun where the record stores one kind of thing', () => {
		open(['Polygon', 'MultiPolygon']);

		expect(screen.getByText('Import a Polygon')).toBeDefined();
		expect(screen.getByText('Use This Polygon')).toBeDefined();
	});

	it('names a point where the record stores one, which is most of them', () => {
		open(['Point']);

		expect(screen.getByText('Import a Point')).toBeDefined();
		expect(screen.getByText('Use This Point')).toBeDefined();
	});

	it('falls back to Geometry where it stores areas and lines alike', () => {
		open(['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']);

		expect(screen.getByText('Import a Geometry')).toBeDefined();
		expect(screen.getByText('Use This Geometry')).toBeDefined();
	});
});
