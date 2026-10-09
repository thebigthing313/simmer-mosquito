/** @vitest-environment jsdom */

/**
 * The trap a collection form saves against is the one its `trapId` names in
 * the trap list it holds now.
 *
 * The form used to keep the chosen trap in state seeded once at mount, so a
 * form opened with a `trapId` before the trap list had loaded held no trap, and
 * a save from a Trap's "Record Collection" on a cold tab threw "Unable to
 * determine the collection location." (#1436). These cases render the form
 * against an empty list, hand it the loaded one, and read what a save sends.
 *
 * The last block reads which date the timing section marks required. In exact
 * mode every collection needs a set date, emptied or not, and the marker used to
 * show only while the collected date was empty (#1440).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	CollectionFormPage,
	type CollectionFormPageProps,
	type CollectionSaveInput,
} from '../../../../../components/adult-surveillance/collections/collection-form';
import { defaultCollectionFormValues } from '../../../../../components/adult-surveillance/collections/collection-form-values';
import type { SchemaCatalogListing } from '../../../../../hooks/queries/catalog-roster-view';
import type { TrapOption } from '../../../../../hooks/queries/use-trap-options';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, to }: { readonly children?: ReactNode; readonly to?: string }) => (
		<a href={to}>{children}</a>
	),
}));
/** The canvas writes out the reference geometry it was handed, which is what a case reads. */
vi.mock('../../../../../components/map', () => ({
	MapCanvas: ({ geoJson }: { readonly geoJson?: unknown }) => (
		<pre data-testid="map">{JSON.stringify(geoJson ?? null)}</pre>
	),
}));
vi.mock('../../../../../components/pickers/address-picker', () => ({ AddressPicker: () => null }));
vi.mock('../../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));

const TODAY = '2026-10-05';

const SET_DAY = '2026-10-04';

const LIGHT_TRAP_METHOD = 'b1a7c0de-0000-4000-8000-000000000001';
const GRAVID_METHOD = 'b1a7c0de-0000-4000-8000-000000000002';
const CO2_LURE = 'b1a7c0de-0000-4000-8000-000000000003';

const METHODS: readonly SchemaCatalogListing[] = [
	{ id: LIGHT_TRAP_METHOD, name: 'CDC light trap', isActive: true, customSchema: null },
	{ id: GRAVID_METHOD, name: 'Gravid trap', isActive: true, customSchema: null },
] as unknown as readonly SchemaCatalogListing[];

const ELM: TrapOption = {
	id: 'b1a7c0de-0000-4000-8000-0000000000a1',
	trapName: 'Elm Court',
	trapCode: 'LT-01',
	description: null,
	collectionMethodId: LIGHT_TRAP_METHOD,
	collectionLureId: CO2_LURE,
	latitude: 38.58,
	longitude: -121.49,
};

const OAK: TrapOption = {
	id: 'b1a7c0de-0000-4000-8000-0000000000a2',
	trapName: 'Oak Lane',
	trapCode: 'GR-02',
	description: null,
	collectionMethodId: GRAVID_METHOD,
	collectionLureId: null,
	latitude: 38.61,
	longitude: -121.44,
};

afterEach(cleanup);

function formFor(
	traps: readonly TrapOption[],
	trapId: string | null,
	onSave: (input: CollectionSaveInput) => Promise<void>,
	values: Partial<CollectionFormPageProps['defaultValues']> = {},
) {
	const props: CollectionFormPageProps = {
		canSubmit: true,
		collectionLures: [],
		collectionMethods: METHODS,
		// A set date as well, which the create form leaves for the crew to type.
		defaultValues: {
			...defaultCollectionFormValues(TODAY, trapId, 'exact_timestamps'),
			startedAt: SET_DAY,
			...values,
		},
		header: {
			title: 'Record Collection',
			backTo: '/adult-surveillance/collections',
			backLabel: 'Collections',
		},
		mode: 'create',
		onSave,
		profiles: [],
		traps,
		units: [],
	};
	return <CollectionFormPage {...props} />;
}

/** One client for the life of a case, so a rerender keeps the form mounted. */
function renderForm(element: ReactNode) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrap = (child: ReactNode) => (
		<QueryClientProvider client={client}>{child}</QueryClientProvider>
	);
	const view = render(wrap(element));
	return { rerender: (next: ReactNode) => view.rerender(wrap(next)) };
}

/** What the first save sent. */
async function savedInput(onSave: ReturnType<typeof vi.fn>): Promise<CollectionSaveInput> {
	fireEvent.click(screen.getByRole('button', { name: 'Save' }));
	await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
	return onSave.mock.calls[0]?.[0] as CollectionSaveInput;
}

function pickTrap(display: string) {
	const pick = screen.getByRole('searchbox', { name: 'Trap' });
	fireEvent.focus(pick);
	fireEvent.change(pick, { target: { value: display } });
	fireEvent.click(screen.getByRole('button', { name: new RegExp(display) }));
}

describe('a collection form opened on a trap before the trap list loads', () => {
	it('saves against that trap once the list arrives', async () => {
		const onSave = vi.fn(async (_input: CollectionSaveInput) => undefined);
		const { rerender } = renderForm(formFor([], ELM.id, onSave));
		rerender(formFor([ELM, OAK], ELM.id, onSave));

		const input = await savedInput(onSave);

		expect(input.trap).toEqual(ELM);
		expect(input.values.trapId).toBe(ELM.id);
	});

	it('names the trap’s method under the picker once the list arrives', () => {
		const onSave = vi.fn(async (_input: CollectionSaveInput) => undefined);
		const { rerender } = renderForm(formFor([], ELM.id, onSave));
		expect(screen.queryByText('CDC light trap')).toBeNull();

		rerender(formFor([ELM, OAK], ELM.id, onSave));

		expect(screen.getByText('CDC light trap')).toBeTruthy();
	});
});

describe('picking in the trap picker', () => {
	it('moves the method, the lure, the hint, the map and the save to the trap picked', async () => {
		const onSave = vi.fn(async (_input: CollectionSaveInput) => undefined);
		renderForm(formFor([ELM, OAK], ELM.id, onSave));
		expect(screen.getByTestId('map').textContent).toContain('-121.49');

		pickTrap('GR-02 - Oak Lane');

		expect(screen.getByText('Gravid trap')).toBeTruthy();
		expect(screen.queryByText('CDC light trap')).toBeNull();
		expect(screen.getByTestId('map').textContent).toContain('-121.44');
		const input = await savedInput(onSave);
		expect(input.trap).toEqual(OAK);
		expect(input.values.trapId).toBe(OAK.id);
		expect(input.values.collectionMethodId).toBe(GRAVID_METHOD);
		expect(input.values.collectionLureId).toBe('none');
	});

	it('holds no trap once the pick is cleared', async () => {
		const onSave = vi.fn(async (_input: CollectionSaveInput) => undefined);
		renderForm(formFor([ELM, OAK], ELM.id, onSave));

		fireEvent.click(screen.getByRole('button', { name: 'Clear trap' }));

		expect(screen.queryByText('CDC light trap')).toBeNull();
		expect(screen.getByTestId('map').textContent).toBe('null');
		// A trap collection with no trap is refused at the field and never
		// reaches `onSave`; `savedTrap` in the values suite is the null it would
		// have carried.
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await vi.waitFor(() =>
			expect(screen.getByRole('searchbox', { name: 'Trap' }).getAttribute('aria-invalid')).toBe(
				'true',
			),
		);
		expect(onSave).not.toHaveBeenCalled();
	});
});

/** Whether the date field labelled `label` carries the required marker. */
function markedRequired(label: string): boolean {
	return screen.getByText(label).querySelector('[aria-hidden="true"]')?.textContent === '*';
}

describe('the set date in exact-timestamp mode', () => {
	const noSave = vi.fn(async (_input: CollectionSaveInput) => undefined);

	it('is required on the form as it opens, with the collected date filled', () => {
		renderForm(formFor([ELM], ELM.id, noSave, { startedAt: null }));

		expect(markedRequired('Set date')).toBe(true);
		expect(markedRequired('Collected date')).toBe(false);
	});

	it('is still required with the collected date left empty', () => {
		renderForm(formFor([ELM], ELM.id, noSave, { startedAt: null, collectedAt: null }));

		expect(markedRequired('Set date')).toBe(true);
		expect(markedRequired('Collected date')).toBe(false);
	});

	it('is not drawn in date-and-duration mode', () => {
		renderForm(
			formFor(
				[ELM],
				ELM.id,
				noSave,
				defaultCollectionFormValues(TODAY, ELM.id, 'collection_date_duration'),
			),
		);

		expect(screen.queryByText('Set date')).toBeNull();
		expect(markedRequired('Collection date')).toBe(true);
	});
});
