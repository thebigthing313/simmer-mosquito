/** @vitest-environment jsdom */
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InsecticideRecord } from '../../../../../hooks/queries/use-insecticide-records';
import type { InsecticideCatalog } from '../../../../../routes/control-operations/chemical/-insecticide-catalog';
import { InsecticideTable } from '../../../../../routes/control-operations/chemical/-insecticide-table';

// The drawer is stubbed so the test can read the product list it was handed
// without opening a Radix sheet. The list is the whole point (#199).
const drawerProducts = vi.hoisted(() => [] as (readonly InsecticideRecord[])[]);

vi.mock('../../../../../routes/control-operations/chemical/-batch-drawer', () => ({
	DeleteInsecticideBatchDialog: () => null,
	InsecticideBatchDrawer: ({
		allProducts,
		trigger,
	}: {
		readonly allProducts: readonly InsecticideRecord[];
		readonly trigger: React.ReactNode;
	}) => {
		drawerProducts.push(allProducts);
		return <>{trigger}</>;
	},
}));

vi.mock('../../../../../hooks/queries/use-insecticide-records', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useInsecticideBatches: () => ({ batches: [], isReady: true, isError: false }),
}));

afterEach(() => {
	cleanup();
	drawerProducts.length = 0;
});

function product(id: string, tradeName: string, isActive: boolean): InsecticideRecord {
	return {
		activeIngredient: 'Bti',
		defaultUnitId: 'unit-1',
		id,
		isActive,
		labelUrl: null,
		metadata: null,
		msdsUrl: null,
		registrationNumber: '73049-38',
		shorthand: null,
		tradeName,
		type: 'larvicide',
	};
}

const allProducts = [product('a', 'VectoBac 12AS', true), product('r', 'Altosid XR', false)];

const catalog: InsecticideCatalog = {
	allProducts,
	batchMutations: {} as InsecticideCatalog['batchMutations'],
	batchTrackingEnabled: true,
	canManage: true,
	mutations: {} as InsecticideCatalog['mutations'],
	units: [],
};

/** The retired disclosure: the catalog holds both products, the table draws one. */
function renderRetiredGroup() {
	const retired = allProducts[1] as InsecticideRecord;
	return render(
		<TooltipProvider>
			<InsecticideTable catalog={catalog} shownProducts={[retired]} />
		</TooltipProvider>,
	);
}

/**
 * The route draws this table twice, once per lifecycle group, and both times
 * hands it the same catalog. Narrowing what reaches the batch drawer to the
 * group on screen is the regression these two cover.
 */
describe('InsecticideTable', () => {
	it('draws only the products it was given as rows', () => {
		renderRetiredGroup();

		expect(screen.getByText('Altosid XR')).toBeTruthy();
		expect(screen.queryByText('VectoBac 12AS')).toBeNull();
	});

	it('hands the batch drawer every product, on the retired group too', () => {
		renderRetiredGroup();
		fireEvent.click(screen.getByLabelText('Show batches for Altosid XR'));

		expect(drawerProducts).not.toHaveLength(0);
		for (const list of drawerProducts) {
			expect(list.map((item) => item.id)).toEqual(['a', 'r']);
		}
	});
});
