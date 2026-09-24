/** @vitest-environment jsdom */
/**
 * Picking an address takes the "you have not placed this yet" refusal off the
 * band.
 *
 * The three statements behind that were copied into eight forms and the habitat
 * form's copy had lost `clearError()`. Most of the time nothing showed, because
 * an address with a centroid seeds the point and seeding clears the error on its
 * way through. An address whose centroid has not streamed seeds nothing, and
 * that is the case the missing line changed: the refusal stayed up on the
 * habitat form and came down on the other seven. Nothing asserted either half
 * anywhere. The handler is `LocationAddressField`'s now, so this file is the one
 * place it is checked.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressOption } from '../../../../components/pickers/address-picker';

const ADDRESS: AddressOption = {
	id: 'address-1',
	lat: 40.52,
	lng: -74.41,
	displayName: null,
	addressLine1: '12 Marsh Rd',
	addressLine2: null,
	locality: 'Edison',
	region: 'NJ',
	postalCode: '08817',
};

/** The same row before its centroid has synced, which the picker can hand over. */
const UNPLACED = { ...ADDRESS, id: 'address-2', lat: null, lng: null } as unknown as AddressOption;

// The real picker reads the address collection over a live query, which is a
// sync seam rather than anything this rule depends on. What the band needs from
// it is one `onSelect` call carrying an address, so the stub is two buttons that
// each make one.
vi.mock('../../../../components/pickers/address-picker', () => ({
	AddressPicker: ({ onSelect }: { readonly onSelect: (address: AddressOption | null) => void }) => (
		<>
			<button onClick={() => onSelect(ADDRESS)} type="button">
				Pick address
			</button>
			<button onClick={() => onSelect(UNPLACED)} type="button">
				Pick unplaced address
			</button>
		</>
	),
}));

const { useDrawLocation } = await import('../../../../hooks/map/use-draw-location');
const { LocationAddressField, LocationBand } = await import(
	'../../../../components/forms/location-band'
);

const MISSING = 'Place the trap point on the map.';

const STOP_AREA = {
	type: 'Polygon',
	coordinates: [
		[
			[-74.41, 40.52],
			[-74.41, 40.53],
			[-74.4, 40.53],
			[-74.41, 40.52],
		],
	],
} as const;

type MissionStop = NonNullable<Parameters<typeof useDrawLocation>[0]['missionStop']>;

function StopHarness({ missionStop }: { readonly missionStop: MissionStop }) {
	const location = useDrawLocation({
		geometryKind: 'controlAction',
		map: null,
		missingMessage: MISSING,
		missionStop,
	});
	return (
		<>
			<button onClick={() => location.requireGeometry()} type="button">
				Save
			</button>
			<LocationBand
				description="The geometry is where the product was applied."
				geometryKind="controlAction"
				location={location}
			/>
		</>
	);
}

function BandHarness({
	onChange = () => undefined,
}: {
	readonly onChange?: (id: string | null) => void;
}) {
	const location = useDrawLocation({
		geometryKind: 'trap',
		map: null,
		missingMessage: MISSING,
	});
	return (
		<>
			<button onClick={() => location.requireGeometry()} type="button">
				Save
			</button>
			<LocationBand
				description="The point is the trap's exact location."
				geometryKind="trap"
				label="Point"
				location={location}
				organizationId="org-1"
			>
				<LocationAddressField location={location} onChange={onChange} value={null} />
			</LocationBand>
		</>
	);
}

describe('LocationBand', () => {
	afterEach(cleanup);

	it('clears the missing-geometry refusal when an address is picked', () => {
		render(<BandHarness />);

		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(screen.getByText(MISSING)).toBeDefined();

		fireEvent.click(screen.getByRole('button', { name: 'Pick address' }));

		expect(screen.queryByText(MISSING)).toBeNull();
	});

	it('clears it for an address that seeds no point', () => {
		render(<BandHarness />);

		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(screen.getByText(MISSING)).toBeDefined();

		fireEvent.click(screen.getByRole('button', { name: 'Pick unplaced address' }));

		expect(screen.queryByText(MISSING)).toBeNull();
	});

	it('reports the address id the picker handed it', () => {
		const onChange = vi.fn();
		render(<BandHarness onChange={onChange} />);

		fireEvent.click(screen.getByRole('button', { name: 'Pick address' }));

		expect(onChange).toHaveBeenCalledWith(ADDRESS.id);
	});

	it('offers no stop geometry off a mission stop', () => {
		render(<BandHarness />);

		expect(screen.queryByRole('button', { name: 'Use stop geometry' })).toBeNull();
	});
});

/**
 * #1233: a form opened off a mission stop draws the stop's geometry, refuses a
 * save once it has been cleared, and offers it back in the band's own button
 * row, beside the refusal.
 */
describe('LocationBand on a mission stop', () => {
	afterEach(cleanup);

	it('draws the stop geometry when the form opens', () => {
		render(<StopHarness missionStop={{ status: 'ready', geometry: STOP_AREA }} />);

		expect(screen.getByText('Captured')).toBeDefined();
	});

	it('refuses a save once the geometry is cleared, and restores it from the band', () => {
		render(<StopHarness missionStop={{ status: 'ready', geometry: STOP_AREA }} />);

		fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(screen.getByText(MISSING)).toBeDefined();
		expect(screen.queryByText('Captured')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Use stop geometry' }));

		expect(screen.getByText('Captured')).toBeDefined();
		expect(screen.queryByText(MISSING)).toBeNull();
	});

	it('holds the button while the stop geometry loads', () => {
		render(<StopHarness missionStop={{ status: 'loading' }} />);

		const button = screen.getByRole('button', { name: 'Use stop geometry' }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(screen.queryByText('Captured')).toBeNull();
	});

	it('says the stop geometry failed to load, and retries from the button', () => {
		const retry = vi.fn();
		render(<StopHarness missionStop={{ status: 'error', retry }} />);

		expect(screen.getByText("The mission stop's geometry could not be loaded.")).toBeDefined();

		fireEvent.click(screen.getByRole('button', { name: 'Use stop geometry' }));

		expect(retry).toHaveBeenCalledOnce();
	});
});
