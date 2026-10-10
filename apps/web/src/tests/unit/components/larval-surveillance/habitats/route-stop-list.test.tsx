/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteStopView } from '../../../../../components/larval-surveillance/habitats/route-data';
import { RouteStopList } from '../../../../../components/larval-surveillance/habitats/route-stop-list';

/**
 * The habitat Route detail page's stop list, for a stop whose Habitat has not
 * streamed and for one whose Habitat has. Until #1600 the first drew the active
 * tone and no status, so it read as an active stop.
 */

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../../routes/route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('../../../../../hooks/larval-surveillance/use-stop-meta', () => ({
	useStopMeta: () => ({ typeNameById: new Map(), tagsByHabitatId: new Map() }),
}));

afterEach(cleanup);

const SHARED = {
	routeItemId: 'i1',
	habitatId: '1a2b3c4d-0000-4000-8000-000000000001',
	ordinal: 1,
	position: 1,
	habitatTypeId: null,
	addressId: null,
	addressLabel: null,
	directionsToNextItem: null,
} as const;

const RESOLVING: RouteStopView = {
	...SHARED,
	name: 'Habitat 1a2b3c4d',
	lat: null,
	lng: null,
	hasLocation: false,
	isResolving: true,
	description: null,
};

const INACCESSIBLE: RouteStopView = {
	...SHARED,
	name: 'Alder catch basin',
	lat: 34.05,
	lng: -118.24,
	hasLocation: true,
	isResolving: false,
	description: '',
	isActive: true,
	isInaccessible: true,
};

function renderList(stop: RouteStopView) {
	render(
		<RouteStopList
			clusters={[{ key: stop.routeItemId, addressId: null, addressLabel: null, stops: [stop] }]}
		/>,
	);
}

function badgeTone(): string | null {
	return document.querySelector('[data-tone]')?.getAttribute('data-tone') ?? null;
}

describe('RouteStopList', () => {
	it('draws a resolving stop with the resolving badge and Loading…', () => {
		renderList(RESOLVING);

		expect(badgeTone()).toBe('resolving');
		expect(screen.getByText('Loading…')).toBeTruthy();
	});

	it('draws an arrived stop in its tone with its status badge', () => {
		renderList(INACCESSIBLE);

		expect(badgeTone()).toBe('inaccessible');
		expect(screen.getByText('Inaccessible')).toBeTruthy();
		expect(screen.queryByText('Loading…')).toBeNull();
	});
});
