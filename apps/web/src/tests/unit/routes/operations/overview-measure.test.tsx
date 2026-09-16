/** @vitest-environment jsdom */

/**
 * The operations overview draws in the record measure the route-loading
 * skeleton reserves, the way the other four domain overviews do.
 *
 * It is the one overview `overview-panel-states.test.tsx` does not render: its
 * three panels fork by hand rather than through `PanelRows`, so that register
 * has no words for it. This suite mocks the reads the route makes, every one
 * answering as still unsettled, renders it whole and reads the measure off the
 * frame, so an overview back in the 1200 column arrives 416px narrower than
 * the skeleton it replaces and fails here (#1043, #1049).
 */

import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { preloadRouteComponent } from '../explorer-route-harness';

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));

vi.mock('../../../../hooks/queries/use-profile-roster', () => ({
	useProfileRoster: () => [],
}));

vi.mock('../../../../components/explorer/use-control-method-options', () => ({
	useControlMethodNames: () => new Map<string, string>(),
}));

vi.mock('../../../../hooks/queries/use-requested-control-actions', () => ({
	useRequestedControlActions: () => ({ requests: [], isLoading: true, isReady: false }),
}));

vi.mock('../../../../hooks/queries/use-assignments', () => ({
	useAssignments: () => ({ assignments: [], isLoading: true, isReady: false }),
}));

vi.mock('../../../../hooks/queries/use-assignment-item-counts', () => ({
	useAssignmentItemCounts: () => ({ countsById: new Map(), isReady: false }),
}));

vi.mock('../../../../hooks/queries/use-missions', () => ({
	useMissions: () => ({ missions: [], isLoading: true, isReady: false }),
}));

vi.mock('../../../../hooks/queries/use-mission-item-counts', () => ({
	useMissionItemCounts: () => ({ countsById: new Map(), isReady: false }),
}));

/** The class `pageContainer` names for a measure, so the assertion cannot drift from the register. */
function measureClass(measure: 'page' | 'record'): string {
	const found = pageContainer({ measure })
		.split(/\s+/)
		.find((cls) => cls.startsWith('max-w-'));
	if (found === undefined) {
		throw new Error(`pageContainer names no ${measure} measure`);
	}
	return found;
}

let Overview: () => ReactNode;

beforeAll(async () => {
	Overview = await preloadRouteComponent(
		() => import('../../../../routes/operations/index'),
		'operations',
	);
}, 300_000);

afterEach(cleanup);

describe('the operations overview', () => {
	it('draws in the record measure the route-loading skeleton reserves', () => {
		const { container } = render(<Overview />);

		expect(container.querySelector(`.${CSS.escape(measureClass('record'))}`)).not.toBeNull();
		expect(container.querySelector(`.${CSS.escape(measureClass('page'))}`)).toBeNull();
	});
});
