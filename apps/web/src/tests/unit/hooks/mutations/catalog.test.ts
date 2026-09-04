/** @vitest-environment jsdom */

/**
 * What a catalog write dispatches: the eight lookups, the two control assets,
 * the insecticides and their batches.
 *
 * Twelve tables behind one factory. `catalog-writes.ts` decides which commands a
 * save names, which direction the switch means, and whether a save that moved
 * nothing writes at all. Those rules are asserted once, on one catalog, rather
 * than twelve times. What a hook adds on top is its columns, its command family,
 * its collection and the question it can be refused over, and that is the rest of
 * the file.
 *
 * Nothing here posts. Every one of these writes goes through `mutateCollection`,
 * so each assertion reads the object it was handed. See `dispatch-harness.ts` for
 * why the other seam exists.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Erased at transform, so these do not import a module the mocks below replace.
import type { CatalogFields } from '../../../../hooks/mutations/use-catalog-mutations';
import type { ControlAssetFields } from '../../../../hooks/mutations/use-control-asset-mutations';
import type {
	InsecticideBatchFields,
	InsecticideFields,
} from '../../../../hooks/mutations/use-insecticide-mutations';
import { installMemoryCollections } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const UNIT = '44444444-4444-4444-8444-444444444444';
const PRODUCT = '55555555-5555-4555-8555-555555555555';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const { dispatches, firstAttempt, lastChanges, lastIntents, lastWrite, resetDispatches, stubApi } =
	await import('./dispatch-harness');
const {
	EQUIPMENT_SAVE_REFUSALS,
	INSECTICIDE_BATCH_SAVE_REFUSALS,
	INSECTICIDE_SAVE_REFUSALS,
	VEHICLE_SAVE_REFUSALS,
} = await import('../../../../lib/acknowledgement-copy');
const { application_methods } = await import('../../../../lib/collections/application_methods');
const { biocontrol_methods } = await import('../../../../lib/collections/biocontrol_methods');
const { outreach_methods } = await import('../../../../lib/collections/outreach_methods');
const { source_reduction_methods } = await import(
	'../../../../lib/collections/source_reduction_methods'
);
const {
	useApplicationMethodMutations,
	useBiocontrolMethodMutations,
	useCollectionLureMutations,
	useCollectionMethodMutations,
	useHabitatTypeMutations,
	useNotificationTypeMutations,
	useOutreachMethodMutations,
	useSourceReductionMethodMutations,
} = await import('../../../../hooks/mutations/use-catalog-mutations');
const { useEquipmentMutations, useVehicleMutations } = await import(
	'../../../../hooks/mutations/use-control-asset-mutations'
);
const { useInsecticideBatchMutations, useInsecticideMutations } = await import(
	'../../../../hooks/mutations/use-insecticide-mutations'
);

beforeEach(() => {
	installMemoryCollections();
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/**
 * Which collection the last write named.
 *
 * Local because the harness stops at the write object, and four of these catalogs
 * are the same three columns under four command families, so naming the wrong one
 * is the mistake a payload assertion cannot see.
 */
function lastCollection(): unknown {
	return dispatches().at(-1)?.collection;
}

function catalogFields(overrides: Partial<CatalogFields> = {}): CatalogFields {
	return { name: 'Gravid', description: null, isActive: true, ...overrides };
}

describe('the rules every catalog write shares', () => {
	// Read on collection methods and true for all twelve: `catalog-writes.ts` is
	// one function per operation, so a change here changes every catalog page.

	it('names the create alone when the row was created in service', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.create(catalogFields());

		expect(lastIntents()).toEqual(['foundation.createCollectionMethod']);
		expect(lastWrite().operation).toBe('insert');
	});

	it('names the retirement beside the create when the switch was off in the dialog', async () => {
		// The old POST had no `is_active` in it, so a row created inactive was
		// written active and the switch flicked back on when the write synced.
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.create(catalogFields({ isActive: false }));

		expect(lastIntents()).toEqual([
			'foundation.createCollectionMethod',
			'foundation.deactivateCollectionMethod',
		]);
	});

	it('returns the id it minted, so the page can select the new row', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		const id = await result.current.create(catalogFields());

		expect((lastWrite().row as { readonly id: string }).id).toBe(id);
	});

	it('names the update for a rename and leaves the switch alone', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.save(RECORD, catalogFields({ name: 'Gravid trap' }), catalogFields(), {});

		expect(lastIntents()).toEqual(['foundation.updateCollectionMethod']);
		expect(lastChanges().name).toBe('Gravid trap');
	});

	it('writes the lifecycle column on a rename that did not touch it', async () => {
		// An update whose changes are all lifecycle would otherwise be a write with
		// no diff, and TanStack DB sends nothing for one. The column travels on
		// every save so that case cannot arise.
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.save(RECORD, catalogFields({ name: 'Gravid trap' }), catalogFields(), {});

		expect(lastChanges().is_active).toBe(true);
	});

	it('names both commands when one save renamed the row and retired it', async () => {
		// One write, because TanStack DB merges two updates to a key and keeps only
		// the last `metadata`: as two calls the rename would arrive under the
		// retirement's name and be dropped behind a 200.
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.save(
			RECORD,
			catalogFields({ name: 'Gravid trap', isActive: false }),
			catalogFields(),
			{},
		);

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'foundation.updateCollectionMethod',
			'foundation.deactivateCollectionMethod',
		]);
	});

	it('names the lifecycle command alone when only the switch moved', async () => {
		// The domain refuses an update with nothing to change, so naming `update`
		// here would fail the whole write.
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.save(RECORD, catalogFields({ isActive: false }), catalogFields(), {});

		expect(lastIntents()).toEqual(['foundation.deactivateCollectionMethod']);
		expect(Object.keys(lastChanges())).not.toContain('name');
	});

	it('reads the switch for its direction on a save', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.save(RECORD, catalogFields(), catalogFields({ isActive: false }), {});

		expect(lastIntents()).toEqual(['foundation.reactivateCollectionMethod']);
		expect(lastChanges().is_active).toBe(true);
	});

	it('dispatches nothing when the dialog saved an untouched row', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.save(RECORD, catalogFields(), catalogFields(), {});

		expect(dispatches()).toHaveLength(0);
	});

	it('reads the row menu switch for its direction', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.setActive(RECORD, false, {});
		expect(lastIntents()).toEqual(['foundation.deactivateCollectionMethod']);
		expect(lastChanges().is_active).toBe(false);

		await result.current.setActive(RECORD, true, {});
		expect(lastIntents()).toEqual(['foundation.reactivateCollectionMethod']);
		expect(lastChanges().is_active).toBe(true);
	});

	it('retires a row without stamping when it was retired', async () => {
		// #123. Deactivate is present tense: the row is out of service now, and
		// nothing records that it went out at a moment. A retirement stamp would be
		// a second, unread answer to the question `is_active` already answers.
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.setActive(RECORD, false, {});

		expect(Object.keys(lastChanges()).sort()).toEqual(['is_active', 'updated_at']);
	});

	it('names the delete and asks nothing before it', async () => {
		// #123. Delete means the row never existed, so a referenced row is refused
		// rather than confirmed. A flag here would offer a way past a refusal that
		// takes none.
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['foundation.deleteCollectionMethod']);
		expect(lastWrite().operation).toBe('delete');
		expect(lastWrite().key).toBe(RECORD);
		expect(lastWrite().acknowledgements).toBeUndefined();
	});
});

describe('which question a catalog save answers', () => {
	// A flag needs both tests: the write has to raise the question, and the
	// catalog has to have it.

	it('catalog: only when the name moved', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await firstAttempt(result.current.refusals, (acknowledgements) =>
			result.current.save(
				RECORD,
				catalogFields({ name: 'Gravid trap' }),
				catalogFields(),
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual(['foundation.updateCollectionMethod']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalLabelChange: false });
	});

	it('catalog: nothing at all on a description-only edit', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await firstAttempt(result.current.refusals, (acknowledgements) =>
			result.current.save(
				RECORD,
				catalogFields({ description: 'Now with a lure' }),
				catalogFields(),
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual(['foundation.updateCollectionMethod']);
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('habitat type: retiring one answers nothing, because nothing subscribes to it', async () => {
		const { result } = renderHook(() => useHabitatTypeMutations());

		await firstAttempt(result.current.refusals, (acknowledgements) =>
			result.current.setActive(RECORD, false, acknowledgements),
		);

		expect(lastIntents()).toEqual(['foundation.deactivateHabitatType']);
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('notification type: retiring one asks about the registrations under it', async () => {
		const { result } = renderHook(() => useNotificationTypeMutations());

		await firstAttempt(result.current.refusals, (acknowledgements) =>
			result.current.setActive(RECORD, false, acknowledgements),
		);

		expect(lastIntents()).toEqual(['publicEngagement.deactivateNotificationType']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedActiveSubscriptionImpact: false });
	});

	it('notification type: a rename that also retires raises both questions at once', async () => {
		const { result } = renderHook(() => useNotificationTypeMutations());

		await firstAttempt(result.current.refusals, (acknowledgements) =>
			result.current.save(
				RECORD,
				catalogFields({ name: 'Fogging notice', isActive: false }),
				catalogFields(),
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual([
			'publicEngagement.updateNotificationType',
			'publicEngagement.deactivateNotificationType',
		]);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalLabelChange: false,
			acknowledgedActiveSubscriptionImpact: false,
		});
	});
});

describe('the columns one catalog has and another does not', () => {
	it('collection method: carries the action threshold, which is its alone', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await result.current.save(
			RECORD,
			catalogFields({ actionThreshold: 25 }),
			catalogFields({ actionThreshold: null }),
			{},
		);

		expect(lastIntents()).toEqual(['foundation.updateCollectionMethod']);
		expect(lastChanges().action_threshold).toBe(25);
	});

	it('collection lure: has no custom schema, so a form passing one writes nothing', async () => {
		const { result } = renderHook(() => useCollectionLureMutations());

		await result.current.save(
			RECORD,
			catalogFields({ customSchema: { fields: [] } }),
			catalogFields(),
			{},
		);

		expect(dispatches()).toHaveLength(0);
	});

	it('habitat type: carries the custom schema and not a threshold', async () => {
		const { result } = renderHook(() => useHabitatTypeMutations());

		await result.current.save(
			RECORD,
			catalogFields({ customSchema: { fields: [] }, actionThreshold: 25 }),
			catalogFields(),
			{},
		);

		expect(lastChanges().custom_schema).toEqual({ fields: [] });
		expect(Object.keys(lastChanges())).not.toContain('action_threshold');
	});

	it('control method: has no description, so a description-only edit writes nothing', async () => {
		const { result } = renderHook(() => useApplicationMethodMutations());

		await result.current.save(
			RECORD,
			catalogFields({ description: 'Truck mounted' }),
			catalogFields(),
			{},
		);

		expect(dispatches()).toHaveLength(0);
	});
});

describe('the four control-method catalogs', () => {
	// One table four times, so the collection and the command family are the only
	// things telling them apart, and a copied call site is the mistake to catch.
	const catalogs = [
		{
			label: 'application',
			use: useApplicationMethodMutations,
			collection: application_methods,
			create: 'controlOperations.createApplicationMethod',
			deactivate: 'controlOperations.deactivateApplicationMethod',
		},
		{
			label: 'source reduction',
			use: useSourceReductionMethodMutations,
			collection: source_reduction_methods,
			create: 'controlOperations.createSourceReductionMethod',
			deactivate: 'controlOperations.deactivateSourceReductionMethod',
		},
		{
			label: 'outreach',
			use: useOutreachMethodMutations,
			collection: outreach_methods,
			create: 'controlOperations.createOutreachMethod',
			deactivate: 'controlOperations.deactivateOutreachMethod',
		},
		{
			label: 'biocontrol',
			use: useBiocontrolMethodMutations,
			collection: biocontrol_methods,
			create: 'controlOperations.createBiocontrolMethod',
			deactivate: 'controlOperations.deactivateBiocontrolMethod',
		},
	];

	for (const catalog of catalogs) {
		it(`${catalog.label}: writes its own collection under its own names`, async () => {
			const { result } = renderHook(() => catalog.use());

			await result.current.create(catalogFields());
			expect(lastIntents()).toEqual([catalog.create]);
			expect(lastCollection()).toBe(catalog.collection());

			await result.current.setActive(RECORD, false, {});
			expect(lastIntents()).toEqual([catalog.deactivate]);
			expect(lastCollection()).toBe(catalog.collection());
		});
	}
});

function assetFields(overrides: Partial<ControlAssetFields> = {}): ControlAssetFields {
	return { name: 'Truck 3', serialNumber: null, metadata: null, isActive: true, ...overrides };
}

describe('a vehicle write', () => {
	it('writes the name into the column the table calls it', async () => {
		const { result } = renderHook(() => useVehicleMutations());

		await result.current.save(RECORD, assetFields({ name: 'Truck 03' }), assetFields(), {});

		expect(lastIntents()).toEqual(['controlOperations.updateVehicle']);
		expect(lastChanges().vehicle_name).toBe('Truck 03');
		expect(Object.keys(lastChanges())).not.toContain('name');
	});

	it('ignores the serial number, which is a column equipment alone has', async () => {
		const { result } = renderHook(() => useVehicleMutations());

		await result.current.save(RECORD, assetFields({ serialNumber: 'V-1' }), assetFields(), {});

		expect(dispatches()).toHaveLength(0);
	});

	it('vehicle: only when the name moved', async () => {
		const { result } = renderHook(() => useVehicleMutations());

		await firstAttempt(VEHICLE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				assetFields({ name: 'Truck 03' }),
				assetFields(),
				acknowledgements,
			),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalVehicleLabelChange: false,
		});
	});

	it('asks nothing when only the notes moved', async () => {
		const { result } = renderHook(() => useVehicleMutations());

		await firstAttempt(VEHICLE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				assetFields({ metadata: { bay: 4 } }),
				assetFields(),
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual(['controlOperations.updateVehicle']);
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('retires from the row menu with no question attached', async () => {
		// `setActive` here takes no answers at all, unlike the lookup catalogs:
		// a retired vehicle strands nothing that has to be counted first.
		const { result } = renderHook(() => useVehicleMutations());

		await result.current.setActive(RECORD, false);

		expect(lastIntents()).toEqual(['controlOperations.deactivateVehicle']);
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useVehicleMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['controlOperations.deleteVehicle']);
	});
});

describe('an equipment write', () => {
	it('writes the name and the serial number under the columns equipment has', async () => {
		const { result } = renderHook(() => useEquipmentMutations());

		await result.current.save(
			RECORD,
			assetFields({ name: 'ULV 2', serialNumber: 'A-2' }),
			assetFields({ name: 'ULV 1', serialNumber: 'A-1' }),
			{},
		);

		expect(lastIntents()).toEqual(['controlOperations.updateEquipment']);
		expect(lastChanges().equipment_name).toBe('ULV 2');
		expect(lastChanges().serial_number).toBe('A-2');
	});

	it('equipment: on the name or the serial number', async () => {
		const { result } = renderHook(() => useEquipmentMutations());
		const current = assetFields({ name: 'ULV 1', serialNumber: 'A-1' });

		await firstAttempt(EQUIPMENT_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(RECORD, { ...current, serialNumber: 'A-2' }, current, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalEquipmentLabelChange: false,
		});
	});

	it('asks nothing when neither label moved', async () => {
		const { result } = renderHook(() => useEquipmentMutations());
		const current = assetFields({ name: 'ULV 1', serialNumber: 'A-1' });

		await firstAttempt(EQUIPMENT_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(RECORD, { ...current, metadata: { bay: 4 } }, current, acknowledgements),
		);

		expect(lastIntents()).toEqual(['controlOperations.updateEquipment']);
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useEquipmentMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['controlOperations.deleteEquipment']);
	});
});

function insecticideFields(overrides: Partial<InsecticideFields> = {}): InsecticideFields {
	return {
		tradeName: 'Aqua-Reslin',
		activeIngredient: 'Permethrin',
		type: 'adulticide',
		registrationNumber: '432-796',
		defaultUnitId: UNIT,
		labelUrl: null,
		msdsUrl: null,
		shorthand: null,
		metadata: null,
		isActive: true,
		...overrides,
	};
}

describe('an insecticide write', () => {
	it('leaves the two inventory columns null, because no form sets them', async () => {
		// An agency that buys in one unit and applies in another needs them. Nothing
		// in the app writes them yet, so a create that guessed a value would be this
		// layer inventing a conversion.
		const { result } = renderHook(() => useInsecticideMutations());

		await result.current.create(insecticideFields());

		const row = lastWrite().row as Record<string, unknown>;
		expect(row.inventory_unit_id).toBeNull();
		expect(row.conversion_factor).toBeNull();
	});

	it('insecticide: only when the product identity moved', async () => {
		const { result } = renderHook(() => useInsecticideMutations());

		await firstAttempt(INSECTICIDE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				insecticideFields({ tradeName: 'Aqua-Reslin 20-20' }),
				insecticideFields(),
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual(['controlOperations.updateInsecticide']);
		expect(lastChanges().trade_name).toBe('Aqua-Reslin 20-20');
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalProductChange: false });
	});

	it('insecticide: and nothing when only the label links moved', async () => {
		const { result } = renderHook(() => useInsecticideMutations());

		await firstAttempt(INSECTICIDE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				insecticideFields({ labelUrl: 'https://example.test/label.pdf' }),
				insecticideFields(),
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual(['controlOperations.updateInsecticide']);
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('reads the registered unit as identity, not as a reference', async () => {
		// The five identity columns are what a past application reads its product
		// back off, and the unit it was registered in is one of them.
		const { result } = renderHook(() => useInsecticideMutations());

		await firstAttempt(INSECTICIDE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				insecticideFields({ defaultUnitId: PRODUCT }),
				insecticideFields(),
				acknowledgements,
			),
		);

		expect(lastChanges().default_unit_id).toBe(PRODUCT);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalProductChange: false });
	});

	it('sends both groups of columns when both moved, under one question', async () => {
		const { result } = renderHook(() => useInsecticideMutations());

		await firstAttempt(INSECTICIDE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				insecticideFields({ type: 'larvicide', shorthand: 'AR' }),
				insecticideFields(),
				acknowledgements,
			),
		);

		expect(lastChanges().type).toBe('larvicide');
		expect(lastChanges().shorthand).toBe('AR');
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalProductChange: false });
	});

	it('dispatches nothing when the drawer saved an untouched product', async () => {
		const { result } = renderHook(() => useInsecticideMutations());

		await result.current.save(RECORD, insecticideFields(), insecticideFields());

		expect(dispatches()).toHaveLength(0);
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useInsecticideMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['controlOperations.deleteInsecticide']);
	});
});

function batchFields(overrides: Partial<InsecticideBatchFields> = {}): InsecticideBatchFields {
	return { insecticideId: PRODUCT, batchName: 'Lot 4', isActive: true, ...overrides };
}

describe('an insecticide batch write', () => {
	it('names the product on the create, because a batch is a tin of one', async () => {
		const { result } = renderHook(() => useInsecticideBatchMutations());

		await result.current.create(batchFields());

		expect(lastIntents()).toEqual(['controlOperations.createInsecticideBatch']);
		expect((lastWrite().row as Record<string, unknown>).insecticide_id).toBe(PRODUCT);
	});

	it('insecticide batch: only when the batch label moved', async () => {
		const { result } = renderHook(() => useInsecticideBatchMutations());

		await firstAttempt(INSECTICIDE_BATCH_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				batchFields({ batchName: 'Lot 4A' }),
				batchFields(),
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual(['controlOperations.updateInsecticideBatch']);
		expect(lastChanges().batch_name).toBe('Lot 4A');
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalBatchLabelChange: false,
		});
	});

	it('refuses to move a batch to another product by saying nothing', async () => {
		// An application already recorded against it was made with what was in that
		// tin, so `updateInsecticideBatch` takes no product. A form that offered the
		// change would save and show no error.
		const { result } = renderHook(() => useInsecticideBatchMutations());

		await result.current.save(RECORD, batchFields({ insecticideId: RECORD }), batchFields());

		expect(dispatches()).toHaveLength(0);
	});

	it('retiring a batch is not a relabelling, so it answers nothing', async () => {
		const { result } = renderHook(() => useInsecticideBatchMutations());

		await firstAttempt(INSECTICIDE_BATCH_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				batchFields({ isActive: false }),
				batchFields(),
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual(['controlOperations.deactivateInsecticideBatch']);
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useInsecticideBatchMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['controlOperations.deleteInsecticideBatch']);
	});
});
