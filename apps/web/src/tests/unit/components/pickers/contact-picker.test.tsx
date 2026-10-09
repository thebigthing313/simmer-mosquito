/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactPicker } from '../../../../components/pickers/contact-picker';

/**
 * A picked contact's name belongs to the id it was picked for. A form that
 * moves the field to another contact shows that contact's name, not the one
 * picked before it (#1434).
 */

const PICKED = {
	id: '11111111-1111-4111-8111-111111111111',
	contactName: 'Ada Reyes',
	company: null,
	email: 'ada@example.com',
	preferredPhone: null,
};

const OTHER = {
	id: '22222222-2222-4222-8222-222222222222',
	contact_name: 'Ben Okafor',
	company: null,
	email: null,
	preferred_phone: null,
};

vi.mock('../../../../lib/collections/contacts', () => ({ contacts: () => ({}) }));
vi.mock('@tanstack/react-db', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-db')>()),
	useLiveQuery: () => ({ data: [PICKED], isReady: true, isError: false }),
}));
vi.mock('../../../../hooks/pickers/use-selected-row-label', () => ({
	useSelectedRowLabel: ({
		value,
		toLabel,
	}: {
		value: string | null;
		toLabel: (row: typeof OTHER) => string;
	}) => (value === OTHER.id ? toLabel(OTHER) : ''),
}));

/** A form field: a pick binds the value, and a second control moves it. */
function BoundContactField() {
	const [value, setValue] = useState<string | null>(null);
	return (
		<>
			<ContactPicker onSelect={(contact) => setValue(contact?.id ?? null)} value={value} />
			<button onClick={() => setValue(OTHER.id)} type="button">
				Move
			</button>
		</>
	);
}

describe('the contact picker', () => {
	afterEach(cleanup);

	it('names the contact a form moves it to, not the one picked before', () => {
		render(<BoundContactField />);
		const input = screen.getByPlaceholderText('Search contacts') as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.click(screen.getByText('Ada Reyes'));
		expect(input.value).toBe('Ada Reyes');

		fireEvent.click(screen.getByRole('button', { name: 'Move' }));

		expect(input.value).toBe('Ben Okafor');
	});
});
