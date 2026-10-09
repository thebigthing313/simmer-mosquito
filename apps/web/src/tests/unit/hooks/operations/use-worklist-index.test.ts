/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
	useWorklistIndex,
	type WorklistIndexFilters,
} from '../../../../hooks/operations/use-worklist-index';

afterEach(cleanup);

interface Row {
	readonly id: string;
	readonly status: string;
	readonly assignedToProfileId: string | null;
}

const ROWS: readonly Row[] = [
	{ id: 'a', status: 'scheduled', assignedToProfileId: 'p1' },
	{ id: 'b', status: 'completed', assignedToProfileId: null },
	{ id: 'c', status: 'scheduled', assignedToProfileId: 'p2' },
];

const PERSONNEL = {
	options: [
		{ id: 'p1', label: 'Ana Ortiz' },
		{ id: 'p2', label: 'Ben Hale' },
	],
	nameById: new Map([
		['p1', 'Ana Ortiz'],
		['p2', 'Ben Hale'],
	]),
};

const NO_FILTERS: WorklistIndexFilters = { statuses: new Set(), people: new Set() };

function renderIndex(initial: { rows?: readonly Row[]; filters?: WorklistIndexFilters } = {}) {
	return renderHook(
		({ rows, filters }) =>
			useWorklistIndex({
				rows,
				filters,
				statusOf: (row) => row.status,
				assigneeOf: (row) => row.assignedToProfileId,
				personnel: PERSONNEL,
			}),
		{ initialProps: { rows: initial.rows ?? ROWS, filters: initial.filters ?? NO_FILTERS } },
	);
}

describe('useWorklistIndex selection', () => {
	it('selects the first visible row when nothing is selected', () => {
		const { result } = renderIndex();
		expect(result.current.selectedId).toBe('a');
		expect(result.current.selected?.id).toBe('a');
	});

	it('falls back to the first visible row when a filter removes the selected one', () => {
		const { result, rerender } = renderIndex();
		act(() => result.current.handleSelect('b'));
		expect(result.current.selectedId).toBe('b');

		rerender({ rows: ROWS, filters: { statuses: new Set(['scheduled']), people: new Set() } });
		expect(result.current.visible.map((row) => row.id)).toEqual(['a', 'c']);
		expect(result.current.selectedId).toBe('a');
		expect(result.current.selected?.id).toBe('a');
	});

	it('returns no selection when no row is visible', () => {
		const { result } = renderIndex({
			filters: { statuses: new Set(['cancelled']), people: new Set() },
		});
		expect(result.current.visible).toEqual([]);
		expect(result.current.selectedId).toBeNull();
		expect(result.current.selected).toBeNull();
	});

	it('clears the selected stop and the highlight when a row is selected', () => {
		const { result } = renderIndex();
		act(() => {
			result.current.setSelectedStopId('stop-1');
			result.current.setHighlightId('stop-2');
		});
		expect(result.current.selectedStopId).toBe('stop-1');
		expect(result.current.highlightId).toBe('stop-2');

		act(() => result.current.handleSelect('c'));
		expect(result.current.selectedId).toBe('c');
		expect(result.current.selectedStopId).toBeNull();
		expect(result.current.highlightId).toBeNull();
	});
});

describe('useWorklistIndex assignee', () => {
	it('puts Unassigned first and matches it to a null assignee', () => {
		const { result, rerender } = renderIndex();
		const [unassigned, ...people] = result.current.assigneeOptions;
		expect(unassigned?.label).toBe('Unassigned');
		expect(people).toEqual(PERSONNEL.options);
		expect(result.current.assigneeLabel(unassigned?.id ?? '')).toBe('Unassigned');
		expect(result.current.assigneeLabel('p2')).toBe('Ben Hale');
		expect(result.current.assigneeLabel('gone')).toBe('Unknown profile');

		rerender({
			rows: ROWS,
			filters: { statuses: new Set(), people: new Set([unassigned?.id ?? '']) },
		});
		expect(result.current.visible.map((row) => row.id)).toEqual(['b']);
	});
});
