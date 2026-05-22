import { describe, expect, it } from 'vitest';
import {
	createSyncBaselineFixture,
	syncBaselineCollectionLures,
	syncBaselineCollectionMethods,
	syncBaselineGenera,
	syncBaselineHabitatTypes,
	syncBaselineProfiles,
	syncBaselineRoutes,
	syncBaselineSpecies,
	syncBaselineTags,
	syncBaselineUnits,
} from './sync-baseline.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

describe('sync baseline seed fixture', () => {
	it('uses stable unique ids for every seeded row', () => {
		const ids = [
			...syncBaselineProfiles.map((row) => row.id),
			...syncBaselineUnits.map((row) => row.id),
			...syncBaselineGenera.map((row) => row.id),
			...syncBaselineSpecies.map((row) => row.id),
			...syncBaselineCollectionMethods.map((row) => row.id),
			...syncBaselineCollectionLures.map((row) => row.id),
			...syncBaselineHabitatTypes.map((row) => row.id),
			...syncBaselineTags.map((row) => row.id),
			...syncBaselineRoutes.map((row) => row.id),
		];

		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.every((id) => uuidPattern.test(id))).toBe(true);
	});

	it('covers inactive non-deleted display rows for historical lookup labels', () => {
		expect(syncBaselineProfiles.some((row) => row.isActive === false)).toBe(true);
		expect(syncBaselineCollectionMethods.some((row) => row.isActive === false)).toBe(true);
		expect(syncBaselineCollectionLures.some((row) => row.isActive === false)).toBe(true);
		expect(syncBaselineHabitatTypes.some((row) => row.isActive === false)).toBe(true);
		expect(syncBaselineTags.some((row) => row.isActive === false)).toBe(true);
	});

	it('keeps global natural keys unique for idempotent upserts', () => {
		expectUnique(syncBaselineUnits.map((row) => row.code));
		expectUnique(syncBaselineUnits.map((row) => row.abbreviation.toLowerCase()));
		expectUnique(syncBaselineGenera.map((row) => row.abbreviation.trim().toLowerCase()));
		expectUnique(syncBaselineGenera.map((row) => row.name.trim().toLowerCase()));
		expectUnique(
			syncBaselineSpecies.map(
				(row) => `${row.genusId ?? 'special'}:${row.epithet.trim().toLowerCase()}`,
			),
		);
	});

	it('includes every organization settings default unit code in the synced server list', () => {
		const seededCodes = syncBaselineUnits.map((row) => row.code);

		expect(seededCodes).toEqual(
			expect.arrayContaining([
				'pound',
				'mile',
				'acre',
				'gallon',
				'fahrenheit',
				'hour',
				'count',
				'miles_per_hour',
			]),
		);
	});

	it('selects a useful subset of seeded species for the organization', () => {
		const selectedSpecies = syncBaselineSpecies.filter((row) => row.selectedForOrganization);

		expect(selectedSpecies.length).toBeGreaterThan(0);
		expect(selectedSpecies.length).toBeLessThan(syncBaselineSpecies.length);
		expect(selectedSpecies.some((row) => row.genusId === null)).toBe(true);
	});

	it('scopes organization-owned fixture ids so multi-org sync tests can detect leaks', () => {
		const firstOrg = createSyncBaselineFixture('00000000-0000-4000-8000-000000000101');
		const secondOrg = createSyncBaselineFixture('00000000-0000-4000-8000-000000000202');

		expectNoOverlap(orgScopedIds(firstOrg), orgScopedIds(secondOrg));
		expect(new Set(firstOrg.organizationSpecies.map((row) => row.speciesId))).toEqual(
			new Set(secondOrg.organizationSpecies.map((row) => row.speciesId)),
		);
	});
});

function expectUnique(values: readonly string[]): void {
	expect(new Set(values).size).toBe(values.length);
}

function expectNoOverlap(left: readonly string[], right: readonly string[]): void {
	const rightIds = new Set(right);
	expect(left.some((id) => rightIds.has(id))).toBe(false);
}

function orgScopedIds(fixture: ReturnType<typeof createSyncBaselineFixture>): readonly string[] {
	return [
		...fixture.profiles.map((row) => row.id),
		...fixture.organizationSpecies.map((row) => row.id),
		...fixture.collectionMethods.map((row) => row.id),
		...fixture.collectionLures.map((row) => row.id),
		...fixture.habitatTypes.map((row) => row.id),
		...fixture.tags.map((row) => row.id),
		...fixture.routes.map((row) => row.id),
	];
}
