/** @vitest-environment jsdom */

/**
 * A save refused over a field and a missing shape says both at once.
 *
 * Before #871 the located record forms wired the missing-shape check three
 * ways. Five reported it from `onSubmitInvalid`, so a refused field and an
 * empty map came back in one pass, and eight checked the shape only once the
 * fields passed, so the missing shape appeared on the second press. One form
 * from each of the three groups is rendered here, now that `useRecordForm`
 * holds the check for all of them: the trap form had it, the address form
 * cleared the error first and the habitat form did neither.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render as renderElement, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	defaultTrapFormValues,
	TrapFormPage,
} from '../../../../components/adult-surveillance/traps/trap-form';
import {
	AddressFormPage,
	defaultAddressFormValues,
} from '../../../../components/gis/addresses/address-form';
import {
	defaultHabitatFormValues,
	HabitatFormPage,
} from '../../../../components/larval-surveillance/habitats/habitat-form';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, to }: { readonly children?: ReactNode; readonly to?: string }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock('../../../../components/map', () => ({ MapCanvas: () => <div data-testid="map" /> }));
vi.mock('../../../../components/pickers/address-picker', () => ({ AddressPicker: () => null }));
vi.mock('../../../../components/write-only', () => ({
	WriteOnly: ({ children }: { readonly children?: ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

/** The geometry control's region fill reads through React Query. */
function render(element: ReactElement) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	renderElement(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

const FORMS: readonly {
	readonly name: string;
	/** The field left invalid, by its accessible name. */
	readonly field: RegExp;
	readonly missing: string;
	readonly render: (onSave: () => Promise<void>) => ReactElement;
}[] = [
	{
		name: 'trap',
		field: /^Collection method/,
		missing: 'Place the trap point on the map.',
		render: (onSave) => (
			<TrapFormPage
				canSubmit
				collectionLures={[]}
				collectionMethods={[]}
				defaultValues={defaultTrapFormValues()}
				header={{ title: 'Create Trap', backTo: '/adult-surveillance/traps', backLabel: 'Traps' }}
				onSave={onSave}
				organizationId="org-1"
			/>
		),
	},
	{
		name: 'address',
		field: /^Display name/,
		missing: 'Geocode the address or place a point on the map.',
		render: (onSave) => (
			<AddressFormPage
				canSubmit
				defaultValues={defaultAddressFormValues()}
				header={{ title: 'Create Address', backTo: '/gis/addresses', backLabel: 'Addresses' }}
				onSave={onSave}
			/>
		),
	},
	{
		name: 'habitat',
		field: /^Description/,
		missing: 'Draw the habitat geometry on the map before saving.',
		render: (onSave) => (
			<HabitatFormPage
				canSubmit
				defaultValues={defaultHabitatFormValues()}
				habitatTypes={[]}
				header={{
					title: 'Create Habitat',
					backTo: '/larval-surveillance/habitats',
					backLabel: 'Habitats',
				}}
				initialGeometry={null}
				mode="create"
				onSave={onSave}
				organizationId="org-1"
			/>
		),
	},
];

describe.each(FORMS)('the $name form', (form) => {
	it('says a refused field and the missing shape on one press', async () => {
		const onSave = vi.fn(async () => undefined);
		render(form.render(onSave));

		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText(form.missing)).toBeDefined();
		const field = screen.getAllByLabelText(form.field)[0];
		await vi.waitFor(() => expect(field?.getAttribute('aria-invalid')).toBe('true'));
		expect(onSave).not.toHaveBeenCalled();
	});
});
