/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignmentTargetPicker } from '../../../../../components/operations/assignments/assignment-target-picker';

/**
 * "Add Stop" clears the selection and leaves the picker mounted, so each of the
 * three fields has to empty itself when its `value` goes back to `null`. The
 * habitat and service request fields used to keep the record just added on
 * screen (#1434).
 */

const HABITAT = {
	id: '33333333-3333-4333-8333-333333333333',
	name: 'Cedar Marsh',
	description: 'North end',
	latitude: 40,
	longitude: -74,
};

const REQUEST = {
	id: '44444444-4444-4444-8444-444444444444',
	addressId: '55555555-5555-4555-8555-555555555555',
	details: 'Standing water in the yard',
	requestDate: '2026-06-01',
};

vi.mock('../../../../../hooks/queries/use-habitat-search', () => ({
	useHabitatSearch: () => ({ matches: [HABITAT], isReady: true, isError: false }),
}));
vi.mock('../../../../../hooks/queries/use-habitat-names', () => ({
	useHabitatNames: (ids: readonly string[]) =>
		new Map(ids.filter((id) => id === HABITAT.id).map((id) => [id, HABITAT.name] as const)),
}));
vi.mock('../../../../../hooks/queries/use-active-traps', () => ({
	useActiveTraps: () => ({ traps: [], isReady: true }),
}));
vi.mock('../../../../../hooks/operations/use-open-service-requests', () => ({
	useOpenServiceRequests: () => ({ requests: [REQUEST], isReady: true }),
}));
vi.mock('../../../../../hooks/operations/use-request-addresses', () => ({
	useRequestAddresses: () => new Map([[REQUEST.addressId, '12 Elm Street']]),
}));

function renderPicker() {
	const onAdd = vi.fn();
	render(
		<AssignmentTargetPicker
			existingKeys={new Set()}
			onAdd={onAdd}
			organizationId="66666666-6666-4666-8666-666666666666"
		/>,
	);
	return onAdd;
}

function pickAndAdd(placeholder: string, row: string) {
	const input = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
	fireEvent.focus(input);
	fireEvent.click(screen.getByText(row));
	expect(input.value).toBe(row);
	fireEvent.click(screen.getByRole('button', { name: 'Add Stop' }));
	return input;
}

describe('the assignment target picker', () => {
	afterEach(cleanup);

	it('empties the habitat field once the habitat is added', () => {
		const onAdd = renderPicker();
		const input = pickAndAdd('Search habitats', 'Cedar Marsh');

		expect(onAdd).toHaveBeenCalledWith({ type: 'habitat', id: HABITAT.id, name: 'Cedar Marsh' });
		expect(input.value).toBe('');
	});

	it('empties the service request field once the request is added', () => {
		const onAdd = renderPicker();
		fireEvent.click(screen.getByRole('button', { name: 'Service Request' }));
		const input = pickAndAdd('Search open requests', '12 Elm Street');

		expect(onAdd).toHaveBeenCalledWith({
			type: 'serviceRequest',
			id: REQUEST.id,
			name: '12 Elm Street',
		});
		expect(input.value).toBe('');
	});
});
