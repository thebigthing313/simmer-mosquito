import { describe, expect, it } from 'vitest';
import {
	createAddressCommand,
	createCollectionLureCommand,
	createCollectionMethodCommand,
	createRegionCommand,
	createSpeciesCommand,
	createUnitCommand,
	DomainValidationError,
	inferGeometryPrecisionPolicy,
	mergeAddressesCommand,
	updateRegionGeometryCommand,
	updateUnitCommand,
} from '../../index.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const operatorUserId = '33333333-3333-4333-8333-333333333333';
const addressId = '44444444-4444-4444-8444-444444444444';
const sourceAddressId = '45454545-4545-4545-8545-454545454545';
const regionId = '55555555-5555-4555-8555-555555555555';
const collectionMethodId = '66666666-6666-4666-8666-666666666666';
const collectionLureId = '77777777-7777-4777-8777-777777777777';
const speciesId = '88888888-8888-4888-8888-888888888888';
const unitId = '99999999-9999-4999-8999-999999999999';

const pointGeometry = { type: 'Point' as const, coordinates: [-90.123456, 35.123456] as const };
const polygonGeometry = {
	type: 'Polygon' as const,
	coordinates: [
		[
			[-90, 35],
			[-89.9, 35],
			[-89.9, 35.1],
			[-90, 35],
		],
	] as const,
};

describe('foundation commands', () => {
	it('normalizes US address creation with point geometry', () => {
		expect(
			createAddressCommand({
				organizationId,
				actorProfileId,
				addressId,
				displayName: '  North Gate ',
				geometry: pointGeometry,
				region: ' ar ',
				postalCode: '72001-1234',
			}).payload,
		).toMatchObject({
			addressId,
			displayName: 'North Gate',
			geometry: pointGeometry,
			country: 'US',
			region: 'AR',
			postalCode: '72001-1234',
		});

		expect(() =>
			createAddressCommand({
				organizationId,
				actorProfileId,
				addressId,
				displayName: 'North Gate',
				geometry: polygonGeometry,
			}),
		).toThrow(DomainValidationError);
	});

	it('requires region boundary acknowledgements and polygon geometry', () => {
		expect(() =>
			updateRegionGeometryCommand({
				organizationId,
				actorProfileId,
				regionId,
				geometry: polygonGeometry,
			}),
		).toThrow(DomainValidationError);

		expect(
			createRegionCommand({
				organizationId,
				actorProfileId,
				regionId,
				name: ' Zone A ',
				geometry: polygonGeometry,
				metadata: { imported: true },
			}).payload,
		).toMatchObject({
			regionId,
			regionFolderId: null,
			name: 'Zone A',
			geometry: polygonGeometry,
			metadata: { imported: true },
		});
	});

	it('models address merge as an acknowledged list of source ids', () => {
		expect(
			mergeAddressesCommand({
				organizationId,
				actorProfileId,
				targetAddressId: addressId,
				sourceAddressIds: [sourceAddressId],
				acknowledgedMergeConsolidatesHistory: true,
			}).payload,
		).toMatchObject({
			targetAddressId: addressId,
			sourceAddressIds: [sourceAddressId],
			acknowledgedMergeConsolidatesHistory: true,
		});
	});

	it('keeps lookup shapes distinct', () => {
		expect(
			createCollectionMethodCommand({
				organizationId,
				actorProfileId,
				collectionMethodId,
				name: ' Gravid ',
				customSchema: { cup: 'number' },
				actionThreshold: 25,
			}).payload,
		).toMatchObject({
			name: 'Gravid',
			customSchema: { cup: 'number' },
			actionThreshold: 25,
		});

		expect(
			createCollectionLureCommand({
				organizationId,
				actorProfileId,
				collectionLureId,
				name: ' CO2 ',
			}).payload,
		).toEqual({
			organizationId,
			actorProfileId,
			collectionLureId,
			name: 'CO2',
			description: null,
		});
	});

	it('uses operator context for global taxonomy', () => {
		expect(
			createSpeciesCommand({
				operatorUserId,
				speciesId,
				genusId: null,
				epithet: 'unidentified',
				displayName: 'Unidentified mosquito',
			}).payload,
		).toMatchObject({
			operatorUserId,
			speciesId,
			genusId: null,
			epithet: 'unidentified',
			commonName: null,
			displayName: 'Unidentified mosquito',
		});
	});

	it('preserves geometry precision for every geometry type', () => {
		expect(inferGeometryPrecisionPolicy(pointGeometry)).toBe('preserve');
		expect(inferGeometryPrecisionPolicy(polygonGeometry)).toBe('preserve');
	});
});

/**
 * The unit catalog is operator-owned like the taxonomy, with one rule of its
 * own: `code` is the key `unit-conversion.ts` matches on, so changing it detaches
 * the unit from every total that crosses units. That is the only field here whose
 * consequence is invisible, and the only one that asks to be acknowledged.
 */
describe('unit commands', () => {
	const base = { operatorUserId, unitId };

	it('normalizes a unit and carries no organization', () => {
		const command = createUnitCommand({
			...base,
			code: ' GAL ',
			unitName: 'gallon',
			abbreviation: 'gal',
			unitType: 'Volume',
			unitSystem: 'US_Customary',
		});

		expect(command.payload).toMatchObject({
			operatorUserId,
			unitId,
			code: 'GAL',
			unitName: 'gallon',
			abbreviation: 'gal',
			// The enums are case-insensitive on the way in and lower-case on the way
			// out, because that is how Postgres spells them.
			unitType: 'volume',
			unitSystem: 'us_customary',
		});
		expect(command.payload).not.toHaveProperty('organizationId');
	});

	it('refuses a unit type or system outside the enum', () => {
		expect(() =>
			createUnitCommand({
				...base,
				code: 'furlong',
				unitName: 'furlong',
				abbreviation: 'fur',
				unitType: 'length',
				unitSystem: 'si',
			}),
		).toThrow(DomainValidationError);
	});

	it('changes only the field an edit named', () => {
		const command = updateUnitCommand({ ...base, abbreviation: 'gal.' });

		expect(command.payload).toMatchObject({ changes: { abbreviation: 'gal.' } });
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('code');
	});

	it('refuses an edit that changes nothing', () => {
		expect(() => updateUnitCommand({ ...base })).toThrow(DomainValidationError);
	});

	/*
	 * The guard is on `code` and only on `code`. Renaming one unhooks the unit
	 * from `unit-conversion.ts`, which does not fail — a total simply stops being
	 * available — so it is the one change a caller has to mean.
	 */
	it('refuses a code change that was not acknowledged', () => {
		expect(() => updateUnitCommand({ ...base, code: 'gallon_us' })).toThrow(DomainValidationError);

		expect(
			updateUnitCommand({ ...base, code: 'gallon_us', acknowledgedUnitCodeChange: true }).payload,
		).toMatchObject({ changes: { code: 'gallon_us' }, acknowledgedUnitCodeChange: true });
	});

	it('does not ask for that acknowledgement when the code is not moving', () => {
		expect(() => updateUnitCommand({ ...base, unitName: 'US gallon' })).not.toThrow();
	});
});
