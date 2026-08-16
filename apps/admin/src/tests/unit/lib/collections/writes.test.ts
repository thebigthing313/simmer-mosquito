/**
 * The write half of the read seam, where the two spellings meet.
 *
 * What is worth testing here is exactly what the seam exists for: that a form's
 * camelCase values land on the row as Postgres column names, and that a create
 * mints the id the command endpoint needs. Neither is visible from a route
 * component, and both were silently wrong the moment `packages/sync` stopped
 * mapping column names — a mutation carrying `unitName` reaches a server that
 * reads `unit_name`, so the field arrives absent and the domain refuses the
 * command for a reason that names the wrong thing.
 *
 * The collections are stubbed rather than driven: what a mutation *becomes* on
 * the wire is `packages/sync`'s to decide and is tested there. This is only the
 * projection.
 */

import { describe, expect, it, vi } from 'vitest';

const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];

/** A collection stub that records the row an insert built, or an update's result. */
function stubCollection() {
	return {
		insert: (row: Record<string, unknown>) => {
			inserted.push(row);
			return Promise.resolve();
		},
		update: (_id: string, mutate: (draft: Record<string, unknown>) => void) => {
			const draft: Record<string, unknown> = {};
			mutate(draft);
			updated.push(draft);
			return Promise.resolve();
		},
		delete: () => Promise.resolve(),
	};
}

vi.mock('../../../../lib/collections/genera', () => ({ genera: stubCollection() }));
vi.mock('../../../../lib/collections/species', () => ({ species: stubCollection() }));
vi.mock('../../../../lib/collections/units', () => ({ units: stubCollection() }));
vi.mock('@simmer-mosquito/sync', () => ({ settleWrite: (value: unknown) => value }));

const { createGenus, createSpecies, createUnit, updateSpecies, updateUnit } = await import(
	'../../../../lib/collections/writes'
);

describe('writes project onto Postgres column names', () => {
	it('writes a species as genus_id, common_name and display_name', async () => {
		inserted.length = 0;
		await createSpecies({
			genusId: 'ff2e6f4e-1d9a-4a0f-9b0f-3c9c0a5f1f11',
			epithet: 'albopictus',
			commonName: 'Asian tiger mosquito',
			displayName: 'Aedes albopictus',
		});

		const row = inserted[0] ?? {};
		expect(row).toMatchObject({
			genus_id: 'ff2e6f4e-1d9a-4a0f-9b0f-3c9c0a5f1f11',
			epithet: 'albopictus',
			common_name: 'Asian tiger mosquito',
			display_name: 'Aedes albopictus',
		});
		// The camelCase spellings are what a form holds and what the server does not
		// read; a row carrying them would fail the far end for the wrong reason.
		expect(row).not.toHaveProperty('displayName');
		expect(row).not.toHaveProperty('genusId');
	});

	it('writes a unit as unit_name, unit_type and unit_system', async () => {
		inserted.length = 0;
		await createUnit({
			code: 'gal',
			unitName: 'gallon',
			abbreviation: 'gal',
			unitType: 'volume',
			unitSystem: 'us_customary',
		});

		const row = inserted[0] ?? {};
		expect(row).toMatchObject({
			code: 'gal',
			unit_name: 'gallon',
			abbreviation: 'gal',
			unit_type: 'volume',
			unit_system: 'us_customary',
		});
		expect(row).not.toHaveProperty('unitName');
		// `units` has no `updated_at` column, so writing one would be a shape error.
		expect(row).not.toHaveProperty('updated_at');
	});

	it('projects an update the same way it projects an insert', async () => {
		updated.length = 0;
		await updateSpecies('7c1a5b6e-8f3d-4e2a-9a1b-2c3d4e5f6071', {
			genusId: null,
			epithet: 'unidentified',
			commonName: null,
			displayName: 'Unidentified mosquito',
		});
		await updateUnit('7c1a5b6e-8f3d-4e2a-9a1b-2c3d4e5f6072', {
			code: 'ct',
			unitName: 'count',
			abbreviation: 'ct',
			unitType: 'count',
			unitSystem: 'si',
		});

		expect(updated[0]).toMatchObject({ genus_id: null, display_name: 'Unidentified mosquito' });
		expect(updated[1]).toMatchObject({ unit_name: 'count', unit_system: 'si' });
	});
});

/**
 * `/commands/{table}` has no path parameter on a POST, so the row's `id` in the
 * body is the row's id. SIMMER writes carry their own ids so they are replay-safe,
 * and the client is the half that mints one.
 */
describe('a create mints its own id', () => {
	it('gives each new row a uuid', async () => {
		inserted.length = 0;
		await createGenus({ name: 'Aedes', abbreviation: 'Ae.' });

		expect(inserted[0]?.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
	});
});
