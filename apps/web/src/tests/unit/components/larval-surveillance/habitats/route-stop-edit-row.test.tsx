/** @vitest-environment jsdom */
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteStopView } from '../../../../../components/larval-surveillance/habitats/route-data';
import { EditStopRow } from '../../../../../components/larval-surveillance/habitats/route-stop-edit-row';

/**
 * Which editors a stop on the habitat Route edit page offers.
 *
 * The description editor saves to the Habitat behind the stop. While that
 * Habitat has not streamed the stop has no description to show, and before
 * #1565 the editor opened on an empty one that a save wrote over the real
 * text. The directions are the Route item's own column, so they stay editable.
 *
 * The badge and the status word are the Habitat's too. Until #1600 a stop whose
 * Habitat had not arrived drew the active tone and no status, so it read as an
 * active stop; it draws the resolving tone and `Loading…` now.
 */

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../../routes/route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

afterEach(cleanup);

const RESOLVED: RouteStopView = {
	routeItemId: 'i1',
	habitatId: '1a2b3c4d-0000-4000-8000-000000000001',
	ordinal: 1,
	position: 1,
	name: 'Alder catch basin',
	description: '',
	habitatTypeId: null,
	addressId: null,
	addressLabel: null,
	lat: 34.05,
	lng: -118.24,
	isActive: true,
	isInaccessible: false,
	directionsToNextItem: null,
	hasLocation: true,
	isResolving: false,
};

const { isActive: _isActive, isInaccessible: _isInaccessible, ...SHARED } = RESOLVED;

const RESOLVING: RouteStopView = {
	...SHARED,
	name: 'Habitat 1a2b3c4d',
	description: null,
	lat: null,
	lng: null,
	hasLocation: false,
	isResolving: true,
};

/*
 * The pairing the editor narrows on is the type's, not the hook's: a stop is
 * resolving exactly when it has no description, so each of the other two
 * combinations is a literal `tsc` refuses.
 */
// @ts-expect-error A resolving stop has no description to carry.
const _resolvingWithDescription: RouteStopView = { ...RESOLVING, description: 'Behind the pump.' };
// @ts-expect-error A resolved stop reads `''` for an empty description, never `null`.
const _resolvedWithoutDescription: RouteStopView = { ...RESOLVED, description: null };
void _resolvingWithDescription;
void _resolvedWithoutDescription;

/*
 * The status is the Habitat's, so a stop carries it only once narrowed to
 * resolved: reading it off the union is a `tsc` error.
 */
function _statusOf(stop: RouteStopView) {
	// @ts-expect-error A resolving stop has no `isActive` to read.
	void stop.isActive;
	// @ts-expect-error A resolving stop has no `isInaccessible` to read.
	void stop.isInaccessible;
	return stop.isResolving ? null : stop.isActive;
}
void _statusOf;

function badgeTone(): string | null {
	return document.querySelector('[data-tone]')?.getAttribute('data-tone') ?? null;
}

function renderRow(stop: RouteStopView) {
	const noop = () => {};
	render(
		<TooltipProvider>
			<ul>
				<EditStopRow
					canSubmit
					count={1}
					focus={{ selected: false, highlighted: false, onSelect: noop, onHover: noop }}
					index={0}
					onEditAddress={noop}
					onMove={noop}
					onRemove={noop}
					onSaveDescription={noop}
					onSaveDirections={noop}
					ordinal={1}
					sameAddressAsPrev={false}
					stop={stop}
					tags={[]}
					typeName={null}
				/>
			</ul>
		</TooltipProvider>,
	);
}

describe('EditStopRow', () => {
	it('offers a writer the description editor once the Habitat has arrived', () => {
		renderRow(RESOLVED);

		expect(screen.getByRole('button', { name: 'Add a description' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Add directions to the next stop' })).toBeTruthy();
	});

	it('offers no description editor while the Habitat is resolving, and keeps the directions', () => {
		renderRow(RESOLVING);

		expect(screen.queryByRole('button', { name: 'Add a description' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Add directions to the next stop' })).toBeTruthy();
	});

	it('draws a resolving stop with the resolving badge and Loading…', () => {
		renderRow(RESOLVING);

		expect(badgeTone()).toBe('resolving');
		expect(screen.getByText('Loading…')).toBeTruthy();
	});

	it('draws an arrived stop in its tone with its status badge', () => {
		renderRow({ ...RESOLVED, isActive: false });

		expect(badgeTone()).toBe('inactive');
		expect(screen.getByText('Inactive')).toBeTruthy();
		expect(screen.queryByText('Loading…')).toBeNull();
	});
});
