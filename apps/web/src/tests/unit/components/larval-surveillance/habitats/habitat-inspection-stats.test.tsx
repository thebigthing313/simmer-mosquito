/** @vitest-environment jsdom */

/**
 * The habitat's Inspection Summary splits wet inspections on the Positive
 * Inspection rule from `@simmer-mosquito/domain`, which reads abundance and not
 * life stages (#1422). The read is a stand-in handing back rows already
 * projected, and the suite reads the legend, since jsdom draws no donut.
 *
 * The first row is the one the old rule and this one disagree on: wet, density
 * `none`, a count of 0, and an egg flag set. Life stages used to make it
 * breeding; abundance says it is not.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ rows: [] as readonly Record<string, unknown>[] }));

vi.mock('@tanstack/react-db', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useLiveQuery: () => ({ data: harness.rows, isReady: true, isError: false }),
}));

vi.mock('../../../../../lib/collections/inspections', () => ({ inspections: () => ({}) }));

const { HabitatInspectionStats } = await import(
	'../../../../../components/larval-surveillance/habitats/habitat-inspection-stats'
);

afterEach(() => {
	cleanup();
});

/** The count beside a legend label, as drawn. */
function legendCount(label: string): string | undefined {
	const term = screen.getByText(label, { selector: 'dt' });
	return term.nextElementSibling?.querySelector('span')?.textContent ?? undefined;
}

describe('HabitatInspectionStats', () => {
	it('splits wet inspections on abundance rather than on life stages', () => {
		harness.rows = [
			{ id: 'a', isWet: true, density: 'none', larvaeCount: 0, hasEggs: true },
			{ id: 'b', isWet: true, density: null, larvaeCount: 3, hasEggs: false },
			{ id: 'c', isWet: true, density: 'light', larvaeCount: null, hasEggs: false },
			{ id: 'd', isWet: false, density: null, larvaeCount: null, hasEggs: false },
		];

		render(<HabitatInspectionStats habitatId="habitat-1" />);

		expect(legendCount('Dry')).toBe('1');
		expect(legendCount('Wet, no breeding')).toBe('1');
		expect(legendCount('Wet, breeding')).toBe('2');
	});
});
