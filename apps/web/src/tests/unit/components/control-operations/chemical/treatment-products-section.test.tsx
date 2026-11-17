/** @vitest-environment jsdom */

/**
 * The Treatment form's product list, drawn (#1753).
 *
 * Product by product, "+ Product" adds a numbered row and Remove is off on the
 * last live row. From a formulation, the rows are the recipe and only the
 * batches edit. Switching back clears the Formulation set and keeps the rows.
 * On edit, a removed saved row stays struck through with its batch links and
 * Keep until Save. The map, the pickers and the batch options are stubbed:
 * they read Mapbox and live collections, and none of them is the question.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, to }: { readonly children?: ReactNode; readonly to?: string }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock('../../../../../components/map', () => ({ MapCanvas: () => <div data-testid="map" /> }));
vi.mock('../../../../../components/pickers/address-picker', () => ({ AddressPicker: () => null }));
vi.mock('../../../../../components/control-operations/control-pickers', () => ({
	HabitatPicker: () => null,
}));
vi.mock('../../../../../components/control-operations/chemical/insecticide-batch-options', () => ({
	InsecticideBatchOptions: ({
		children,
	}: {
		readonly children: (options: readonly { label: string; value: string }[]) => ReactNode;
	}) => children([]),
}));

const { TreatmentFormPage } = await import(
	'../../../../../components/control-operations/chemical/treatment-form'
);
const { defaultTreatmentFormValues } = await import(
	'../../../../../components/control-operations/chemical/treatment-form-values'
);
const { keepOneProductLabel } = await import(
	'../../../../../components/control-operations/chemical/treatment-line-row'
);

type FormValues = Parameters<typeof TreatmentFormPage>[0]['defaultValues'];

const ALTOSID = 'a0000000-0000-4000-8000-000000000001';
const VECTOBAC = 'a0000000-0000-4000-8000-000000000002';
const GALLON = 'b0000000-0000-4000-8000-000000000001';
const OUNCE = 'b0000000-0000-4000-8000-000000000002';
const MIX = 'c0000000-0000-4000-8000-000000000001';

const catalogs = {
	applicationMethods: [],
	canSubmit: true,
	equipment: [],
	formulationComponents: [
		{ id: 'fc1', formulationId: MIX, insecticideId: ALTOSID, amount: 2, unitId: GALLON },
		{ id: 'fc2', formulationId: MIX, insecticideId: VECTOBAC, amount: 13, unitId: OUNCE },
	],
	formulations: [
		{ id: MIX, formulationName: 'Mix A', isActive: true, batchSize: 26, batchUnitId: GALLON },
	],
	header: {
		title: 'Record Treatment',
		backTo: '/control-operations/chemical',
		backLabel: 'Treatments',
	},
	insecticides: [
		{ id: ALTOSID, tradeName: 'Altosid XR-G', isActive: true, defaultUnitId: GALLON },
		{ id: VECTOBAC, tradeName: 'VectoBac 12AS', isActive: true, defaultUnitId: OUNCE },
	],
	missionStop: null,
	onSave: async () => undefined,
	organizationId: 'org-1',
	profiles: [],
	units: [
		{
			id: GALLON,
			code: 'gal',
			unitName: 'Gallon',
			abbreviation: 'gal',
			unitType: 'volume',
			unitSystem: 'imperial',
		},
		{
			id: OUNCE,
			code: 'fl_oz',
			unitName: 'Fluid ounce',
			abbreviation: 'oz',
			unitType: 'volume',
			unitSystem: 'imperial',
		},
	],
	vehicles: [],
} as const;

afterEach(cleanup);

function renderForm(values: FormValues, mode: 'create' | 'edit' = 'create') {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<TreatmentFormPage {...catalogs} defaultValues={values} mode={mode} />
		</QueryClientProvider>,
	);
}

function products(): HTMLElement {
	const list = screen.getByText(/^\d+ products?/).closest('section');
	if (list === null) {
		throw new Error('No product list.');
	}
	return list;
}

describe('product by product', () => {
	it('adds a numbered row, and keeps Remove off on the last live row', () => {
		renderForm(defaultTreatmentFormValues('America/New_York'));

		const remove = within(products()).getByRole('button', { name: 'Remove' });
		expect(remove).toHaveProperty('disabled', true);
		expect(remove.getAttribute('title')).toBe(keepOneProductLabel);
		expect(keepOneProductLabel).toBe('A treatment keeps at least one product');

		fireEvent.click(within(products()).getByRole('button', { name: 'Product' }));

		expect(within(products()).getByText('Product 2')).toBeDefined();
		expect(within(products()).getByText('2 products')).toBeDefined();
		for (const button of within(products()).getAllByRole('button', { name: 'Remove' })) {
			expect(button).toHaveProperty('disabled', false);
		}
	});
});

describe('from a formulation', () => {
	const fromMix: FormValues = {
		...defaultTreatmentFormValues('America/New_York'),
		entry: 'formulation',
		formulationId: MIX,
		mixAmount: 78,
		lines: [
			{
				id: 'd0000000-0000-4000-8000-000000000001',
				insecticideId: VECTOBAC,
				amount: 39,
				unitId: OUNCE,
				batchIds: [],
				stored: false,
				removed: false,
				savedBatchCount: 0,
			},
			{
				id: 'd0000000-0000-4000-8000-000000000002',
				insecticideId: ALTOSID,
				amount: 6,
				unitId: GALLON,
				batchIds: [],
				stored: false,
				removed: false,
				savedBatchCount: 0,
			},
		],
	};

	it('draws the recipe rows read-only with the mix in the footer', () => {
		renderForm(fromMix);

		const list = products();
		expect(within(list).getByText('39 oz')).toBeDefined();
		expect(within(list).getByText('6 gal')).toBeDefined();
		expect(within(list).queryByRole('button', { name: 'Remove' })).toBeNull();
		expect(within(list).queryByRole('button', { name: 'Product' })).toBeNull();
		expect(within(list).getByText('2 products from 78 gal of Mix A')).toBeDefined();
		expect(
			within(list).getByText('To add or drop a product, switch to product by product.'),
		).toBeDefined();
	});

	it('keeps the rows as editable lines when the crew switches back', () => {
		renderForm(fromMix);

		fireEvent.click(screen.getByRole('radio', { name: 'Product by product' }));

		const list = products();
		expect(within(list).getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
		expect(within(list).getByText('2 products')).toBeDefined();
		expect(screen.queryByLabelText(/Total mix applied/)).toBeNull();
	});
});

describe('a saved row removed on edit', () => {
	it('stays struck through with its batch links and Keep until Save', () => {
		const saved = {
			insecticideId: ALTOSID,
			amount: 12,
			unitId: GALLON,
			stored: true,
			removed: false,
		};
		renderForm(
			{
				...defaultTreatmentFormValues('America/New_York'),
				lines: [
					{ ...saved, id: 'e1', batchIds: ['lot-1', 'lot-2'], savedBatchCount: 2 },
					{ ...saved, id: 'e2', insecticideId: VECTOBAC, batchIds: [], savedBatchCount: 0 },
				],
			},
			'edit',
		);

		fireEvent.click(
			within(products()).getAllByRole('button', { name: 'Remove' })[0] as HTMLElement,
		);

		const list = products();
		expect(within(list).getByText('Altosid XR-G 12 gal').tagName).toBe('S');
		expect(within(list).getByText(/2 batch links go with it/)).toBeDefined();
		expect(within(list).getByText('1 product')).toBeDefined();

		fireEvent.click(within(list).getByRole('button', { name: 'Keep' }));

		expect(within(products()).getByText('2 products')).toBeDefined();
	});
});
