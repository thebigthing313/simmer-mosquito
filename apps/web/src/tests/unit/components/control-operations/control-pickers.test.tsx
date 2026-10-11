/** @vitest-environment jsdom */

/**
 * The Habitat picker the control-action forms and the inspection form share,
 * over real collections holding rows in memory.
 *
 * The inspection form drew a picker of its own until #1468, holding its picked
 * label in its own state, so a value moved from outside kept the previous
 * habitat's name over the new id. It also searched retired habitats where the
 * control pickers do not, which is the one difference the shared picker keeps
 * as `includeRetired`.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HabitatPicker } from '../../../../components/control-operations/control-pickers';
import { habitats } from '../../../../lib/collections/habitats';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const CEDAR = '22222222-2222-4222-8222-222222222222';
const ALDER = '33333333-3333-4333-8333-333333333333';
const RETIRED = '44444444-4444-4444-8444-444444444444';

function habitat(id: string, name: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		organization_id: ORGANIZATION,
		habitat_name: name,
		description: '',
		habitat_type_id: null,
		address_id: null,
		is_active: true,
		is_inaccessible: false,
		lat: 40.1,
		lng: -74.2,
		geom_type: 'ST_Point',
		metadata: {},
		created_at: new Date('2026-08-01T10:00:00Z'),
		updated_at: new Date('2026-08-02T10:00:00Z'),
		created_by_profile_id: null,
		updated_by_profile_id: null,
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(habitats, [
		habitat(CEDAR, 'Cedar Marsh'),
		habitat(ALDER, 'Alder Pond'),
		habitat(RETIRED, 'Birch Ditch', { is_active: false }),
	]);
});

afterEach(cleanup);

function picker(props: { readonly value: string | null; readonly includeRetired?: boolean }) {
	return (
		<HabitatPicker
			includeRetired={props.includeRetired}
			onSelect={() => undefined}
			organizationId={ORGANIZATION}
			required
			value={props.value}
		/>
	);
}

function input(): HTMLInputElement {
	return screen.getByRole('searchbox', { name: 'Habitat' }) as HTMLInputElement;
}

describe('the habitat picker', () => {
	it('names the second habitat once its value moves from outside', async () => {
		const { rerender } = render(picker({ value: CEDAR, includeRetired: true }));
		await waitFor(() => expect(input().value).toBe('Cedar Marsh'));

		rerender(picker({ value: ALDER, includeRetired: true }));

		await waitFor(() => expect(input().value).toBe('Alder Pond'));
	});

	it('lists a retired habitat when the inspection form asks for them', async () => {
		render(picker({ value: null, includeRetired: true }));
		fireEvent.focus(input());

		expect(await screen.findByText('Birch Ditch')).toBeDefined();
	});

	it('leaves a retired habitat out of a control action', async () => {
		render(picker({ value: null }));
		fireEvent.focus(input());

		expect(await screen.findByText('Cedar Marsh')).toBeDefined();
		expect(screen.queryByText('Birch Ditch')).toBeNull();
	});
});
