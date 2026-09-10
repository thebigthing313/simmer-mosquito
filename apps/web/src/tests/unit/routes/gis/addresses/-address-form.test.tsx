/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	AddressFormValues,
	AddressPointGeometry,
} from '../../../../../routes/gis/addresses/-address-form';

/**
 * The address form, as the two things a person meets when a save goes wrong.
 *
 * Both were hand-rolled here until this form moved onto the kit: a rule copied
 * out of the domain builder and reported as one string in a private alert, and
 * an `isSaving`/`saveError` pair that left Save dead until a field was edited.
 * The kit answers both, and what this pins is that this form is wired to it —
 * a domain rule arrives on the field it belongs to, and a refused save says so
 * and can be tried again.
 *
 * The map is stubbed because none of that is a map question. Placing a point is
 * covered where the draw controller lives; here the form opens with one.
 */

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, to }: { readonly children?: ReactNode; readonly to?: string }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock('../../../../../components/map', () => ({ MapCanvas: () => <div data-testid="map" /> }));

const { AddressFormPage, defaultAddressFormValues, validateAddress } = await import(
	'../../../../../routes/gis/addresses/-address-form'
);

const POINT: AddressPointGeometry = { type: 'Point', coordinates: [-121.49, 38.58] };

function placedValues(): AddressFormValues {
	return { ...defaultAddressFormValues(), displayName: 'District yard' };
}

function renderForm(
	onSave: (input: { readonly values: AddressFormValues }) => Promise<void>,
	defaultValues: AddressFormValues = placedValues(),
) {
	return render(
		<AddressFormPage
			canSubmit
			defaultValues={defaultValues}
			header={{
				title: 'Create Address',
				description: 'Add a geocoded address to the address book.',
				backTo: '/gis/addresses',
				backLabel: 'Address Book',
			}}
			initialGeometry={POINT}
			onSave={onSave}
			submitLabel="Create Address"
		/>,
	);
}

function save(): HTMLElement {
	return screen.getByRole('button', { name: 'Create Address' });
}

afterEach(cleanup);

describe('AddressFormPage', () => {
	it('reports a domain rule on the field that holds it', async () => {
		const onSave = vi.fn(async () => undefined);
		renderForm(onSave, defaultAddressFormValues());

		fireEvent.click(save());

		expect(await screen.findByText('Display name is required.')).toBeDefined();
		expect(onSave).not.toHaveBeenCalled();
	});

	it('shows a refused save and lets it be tried again', async () => {
		const onSave = vi.fn(async () => {
			throw new Error('An address with this name already exists.');
		});
		renderForm(onSave);

		fireEvent.click(save());

		expect(await screen.findByText('An address with this name already exists.')).toBeDefined();
		expect(save().hasAttribute('disabled')).toBe(false);

		fireEvent.click(save());

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledTimes(2);
		});
	});

	// The postal format is one of the rules the hand-copied validation never
	// checked, so it came back from the server as a save that failed for no
	// stated reason. The builder holds it, and the field it belongs to is named.
	it('runs the rules the form used to leave to the server', () => {
		expect(validateAddress(placedValues(), POINT, null)).toBeUndefined();

		const result = validateAddress({ ...placedValues(), postalCode: '9581' }, POINT, null);

		expect(result?.fields?.postalCode).toBe('Postal code must be a ZIP or ZIP+4 postal code.');
		expect(result?.form).toBeUndefined();
	});

	// The point is placed on the map, so a missing one is the location band's to
	// report; the builder must not be handed the null and answer for it first.
	it('leaves an unplaced point to the location band', () => {
		expect(validateAddress(placedValues(), null, null)).toBeUndefined();
	});

	it('hands the save the point it opened with', async () => {
		const onSave = vi.fn(async () => undefined);
		renderForm(onSave);

		fireEvent.click(save());

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith({
				values: placedValues(),
				geometry: POINT,
				geometryChanged: false,
				geocoderResponse: null,
			});
		});
	});
});
