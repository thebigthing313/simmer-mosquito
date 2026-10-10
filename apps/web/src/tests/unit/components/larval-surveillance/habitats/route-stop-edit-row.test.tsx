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

const RESOLVING: RouteStopView = {
	...RESOLVED,
	name: 'Habitat 1a2b3c4d',
	description: null,
	lat: null,
	lng: null,
	hasLocation: false,
	isResolving: true,
};

function renderRow(stop: RouteStopView) {
	const noop = () => {};
	render(
		<TooltipProvider>
			<ul>
				<EditStopRow
					canSubmit
					index={0}
					isFirst
					isHighlighted={false}
					isLast
					isSelected={false}
					onEditAddress={noop}
					onHover={noop}
					onMove={noop}
					onRemove={noop}
					onSaveDescription={noop}
					onSaveDirections={noop}
					onSelect={noop}
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
});
