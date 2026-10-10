/** @vitest-environment jsdom */

/**
 * Every catalog on the register, through each of the three view hooks.
 *
 * The suite walks `catalogs` itself, so a descriptor added later is covered
 * here without a new case. What it holds is the part a descriptor can get
 * wrong: the name column it orders by and reads as `name`, and the lifecycle
 * split the records view makes.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalogOptions } from '../../../../hooks/explorer/use-catalog-options';
import { useControlMethodNames } from '../../../../hooks/explorer/use-control-method-names';
import { type CatalogDescriptor, catalogs } from '../../../../hooks/queries/catalog-register';
import { useCatalogRecords } from '../../../../hooks/queries/use-catalog-records';
import { useCatalogRoster } from '../../../../hooks/queries/use-catalog-roster';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

beforeEach(() => {
	installMemoryCollections();
});

/** Four rows, seeded out of name order, two of them retired. */
function seedCatalog(catalog: CatalogDescriptor): void {
	const row = (id: string, name: string, isActive: boolean) => ({
		id,
		[catalog.nameColumn]: name,
		is_active: isActive,
	});
	seedRows(catalog.collection, [
		row('c', 'Culvert', true),
		row('d', 'Ditch', false),
		row('a', 'Abandoned pool', true),
		row('b', 'Basin', false),
	]);
}

describe.each(Object.entries(catalogs))('the %s catalog', (_key, catalog) => {
	it('splits its records into active and retired, each in name order', async () => {
		seedCatalog(catalog);

		const { result } = await renderRead(() => useCatalogRecords(catalog));

		expect(result.current.activeRecords.map((record) => record.name)).toEqual([
			'Abandoned pool',
			'Culvert',
		]);
		expect(result.current.inactiveRecords.map((record) => record.name)).toEqual(['Basin', 'Ditch']);
		expect(result.current.activeRecords.every((record) => record.isActive)).toBe(true);
		expect(result.current.inactiveRecords.every((record) => !record.isActive)).toBe(true);
	});

	it('offers a form every row, retired ones included', async () => {
		seedCatalog(catalog);

		const { result } = await renderRead(() => useCatalogRoster(catalog));

		expect(result.current.map((listing) => listing.id).sort()).toEqual(['a', 'b', 'c', 'd']);
		expect(result.current.find((listing) => listing.id === 'd')).toMatchObject({
			name: 'Ditch',
			isActive: false,
		});
	});

	it('offers a filter every row in name order, with a name for every id', async () => {
		seedCatalog(catalog);

		const { result } = await renderRead(() => useCatalogOptions(catalog));

		expect(result.current.options.map((option) => option.label)).toEqual([
			'Abandoned pool',
			'Basin',
			'Culvert',
			'Ditch',
		]);
		expect([...result.current.nameById]).toEqual([
			['a', 'Abandoned pool'],
			['b', 'Basin'],
			['c', 'Culvert'],
			['d', 'Ditch'],
		]);
	});
});

describe('useControlMethodNames', () => {
	it('names a method from any of the four control method catalogs', async () => {
		seedRows(catalogs.applicationMethods.collection, [
			{ id: 'm1', name: 'Truck ULV', is_active: true },
		]);
		seedRows(catalogs.sourceReductionMethods.collection, [
			{ id: 'm2', name: 'Ditch cleaning', is_active: false },
		]);
		seedRows(catalogs.biocontrolMethods.collection, [
			{ id: 'm3', name: 'Mosquitofish', is_active: true },
		]);
		seedRows(catalogs.outreachMethods.collection, [
			{ id: 'm4', name: 'Door hanger', is_active: true },
		]);

		const { result } = await renderRead(useControlMethodNames);

		expect(Object.fromEntries(result.current)).toEqual({
			m1: 'Truck ULV',
			m2: 'Ditch cleaning',
			m3: 'Mosquitofish',
			m4: 'Door hanger',
		});
	});
});
