/** @vitest-environment jsdom */

/**
 * The "n positive" badge beside each inspector on the larval overview's Daily
 * Inspections panel counts Positive Inspections, the rule
 * `@simmer-mosquito/domain` exports, which reads abundance and not life stages
 * (#1422).
 *
 * The inspector's first row is the one the old rule and this one disagree on:
 * wet, density `none`, a count of 0, and an egg flag set. The panel used to
 * count it as positive because a life stage was recorded; abundance says it is
 * not. The second row is positive on a count with no band, and the third is
 * dry, so the badge reads `1 positive`.
 *
 * The reads are stand-ins and the router is the one beside the route suites,
 * so no route tree is imported.
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LarvalActivityRow } from '../../../../hooks/queries/larval-activity-view';
import { preloadRouteComponent } from '../explorer-route-harness';

const NO_STAGES = {
	hasEggs: false,
	hasFirstInstar: false,
	hasSecondInstar: false,
	hasThirdInstar: false,
	hasFourthInstar: false,
	hasPupae: false,
} as const;

function row(
	id: string,
	fields: Pick<LarvalActivityRow, 'isWet' | 'density' | 'larvaeCount'> & Partial<LarvalActivityRow>,
): LarvalActivityRow {
	return {
		id,
		inspectionDate: '2026-10-09',
		inspectedByProfileId: 'profile-1',
		inspectedByName: 'Pat Inspector',
		habitatId: `habitat-${id}`,
		habitatName: `Habitat ${id}`,
		habitatTypeId: null,
		typeName: null,
		latitude: 40,
		longitude: -74,
		...NO_STAGES,
		...fields,
	};
}

const ROWS: readonly LarvalActivityRow[] = [
	row('a', { isWet: true, density: 'none', larvaeCount: 0, hasEggs: true }),
	row('b', { isWet: true, density: null, larvaeCount: 3, hasFirstInstar: true }),
	row('c', { isWet: false, density: null, larvaeCount: null }),
];

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));

vi.mock('../../../../hooks/queries/use-larval-activity-for-date', () => ({
	useLarvalActivityForDate: () => ({ rows: ROWS, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/queries/use-heavy-larval-activity', () => ({
	useHeavyLarvalActivity: () => ({ rows: [], isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/larval-surveillance/use-species-composition', () => ({
	useSpeciesComposition: () => ({ totals: [], grandTotal: 0, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/larval-surveillance/use-samples-awaiting', () => ({
	useSamplesAwaiting: () => ({ samples: [], total: 0, isLoading: false, isError: false }),
}));

let Overview: () => ReactNode;

beforeAll(async () => {
	Overview = await preloadRouteComponent(
		() => import('../../../../routes/larval-surveillance/index'),
		'larval surveillance',
	);
}, 300_000);

afterEach(cleanup);

describe('the Daily Inspections positive badge', () => {
	it('counts Positive Inspections on abundance rather than on life stages', () => {
		render(<Overview />);

		expect(screen.getByText(/^\d+ positive$/).textContent).toBe('1 positive');
	});
});
