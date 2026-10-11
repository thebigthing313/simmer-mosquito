/** @vitest-environment jsdom */

/**
 * The Habitat detail page's read, and the two Profiles its audit rows name.
 *
 * The Created and Updated rows used to resolve each Profile through a roster
 * read behind a `<Suspense>` (#874). The hook joins them, `left`, so a Profile
 * the client does not hold reads as `null` beside its id and nobody recorded
 * reads as `null` beside a `null` id.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useHabitatSuspense } from '../../../../hooks/queries/use-habitat-suspense';
import { habitats } from '../../../../lib/collections/habitats';
import { profiles } from '../../../../lib/collections/profiles';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const PROFILE = '11111111-1111-4111-8111-111111111111';
const MISSING = '99999999-9999-4999-8999-999999999999';

function habitat(overrides: Record<string, unknown>) {
	return {
		id: 'h1',
		habitat_name: 'Alder catch basin',
		description: '',
		habitat_type_id: null,
		address_id: null,
		is_active: true,
		is_inaccessible: false,
		lat: 34.1,
		lng: -118.2,
		geom_type: 'ST_Point',
		metadata: {},
		created_at: new Date('2026-08-01T10:00:00Z'),
		updated_at: new Date('2026-08-02T10:00:00Z'),
		created_by_profile_id: null,
		updated_by_profile_id: null,
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(profiles, [{ id: PROFILE, display_name: 'Rosa Lam' }]);
});

async function readHabitat() {
	const { result } = await renderRead(() => useHabitatSuspense('h1'));
	expect(result.current, 'the hook returned no habitat').toBeDefined();
	return result.current as NonNullable<typeof result.current>;
}

describe('useHabitatSuspense', () => {
	it('names who created and who last updated the habitat', async () => {
		seedRows(habitats, [
			habitat({ created_by_profile_id: PROFILE, updated_by_profile_id: MISSING }),
		]);

		const record = await readHabitat();

		expect(record).toMatchObject({
			createdByProfileId: PROFILE,
			createdByName: 'Rosa Lam',
			updatedByProfileId: MISSING,
			updatedByName: null,
		});
	});

	it('reads a habitat type the client does not hold as null beside its id', async () => {
		seedRows(habitats, [habitat({ habitat_type_id: MISSING })]);

		const record = await readHabitat();

		expect(record).toMatchObject({ typeId: MISSING, typeName: null });
	});

	it('reads nobody recorded as a null id and a null name', async () => {
		seedRows(habitats, [habitat({})]);

		const record = await readHabitat();

		expect(record).toMatchObject({
			createdByProfileId: null,
			createdByName: null,
			updatedByProfileId: null,
			updatedByName: null,
		});
	});
});
