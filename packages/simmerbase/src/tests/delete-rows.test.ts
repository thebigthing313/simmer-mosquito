import { afterAll, describe, expect, it } from 'vitest';
import z from 'zod';
import { deleteRows } from '../delete-rows';
import { insert } from '../insert';
import { GeneraBaseRowSchema, GeneraInsertSchema } from '../schemas/genera';
import { GroupsBaseRowSchema, GroupsInsertSchema } from '../schemas/groups';
import { SpeciesBaseRowSchema, SpeciesInsertSchema } from '../schemas/species';
import {
	TagGroupsBaseRowSchema,
	TagGroupsInsertSchema,
} from '../schemas/tag_groups';
import { TagsBaseRowSchema, TagsInsertSchema } from '../schemas/tags';
import { UnitsBaseRowSchema, UnitsInsertSchema } from '../schemas/units';
import { cleanupByIds, createTestClient, randomUUID } from './setup';

const supabase = createTestClient();

// Track IDs that need cleanup (in case delete tests don't actually delete)
const remainingIds: Record<string, string[]> = {
	tags: [],
	species: [],
	genera: [],
	units: [],
	tag_groups: [],
	groups: [],
};

afterAll(async () => {
	await cleanupByIds(supabase, 'tags', remainingIds.tags);
	await cleanupByIds(supabase, 'species', remainingIds.species);
	await cleanupByIds(supabase, 'genera', remainingIds.genera);
	await cleanupByIds(supabase, 'units', remainingIds.units);
	await cleanupByIds(supabase, 'tag_groups', remainingIds.tag_groups);
	await cleanupByIds(supabase, 'groups', remainingIds.groups);
});

// Helper to insert test data
async function insertUnit(
	overrides: Partial<{ id: string; unit_name: string }> = {},
) {
	const id = overrides.id ?? randomUUID();
	const row = {
		id,
		unit_name: overrides.unit_name ?? `DeleteTest_${id.slice(0, 8)}`,
		abbreviation: `dt${id.slice(0, 4)}`,
		base_unit_id: null,
		conversion_factor: null,
		conversion_offset: null,
		unit_system: null,
		unit_type: null,
	};
	const result = await insert(
		'units',
		UnitsBaseRowSchema,
		UnitsInsertSchema,
		supabase,
		[row],
	);
	if (result.error)
		throw new Error(`Insert unit failed: ${result.error.message}`);
	remainingIds.units.push(id);
	return result.data![0];
}

async function insertTagGroup(name?: string) {
	const id = randomUUID();
	const row = { id, tag_group_name: name ?? `DeleteTG_${id.slice(0, 8)}` };
	const result = await insert(
		'tag_groups',
		TagGroupsBaseRowSchema,
		TagGroupsInsertSchema,
		supabase,
		[row],
	);
	if (result.error)
		throw new Error(`Insert tag_group failed: ${result.error.message}`);
	remainingIds.tag_groups.push(id);
	return result.data![0];
}

async function insertGenus(name?: string) {
	const id = randomUUID();
	const row = {
		id,
		genus_name: name ?? `DeleteGenus_${id.slice(0, 8)}`,
		abbreviation: `DG${id.slice(0, 3)}`,
		description: null,
	};
	const result = await insert(
		'genera',
		GeneraBaseRowSchema,
		GeneraInsertSchema,
		supabase,
		[row],
	);
	if (result.error)
		throw new Error(`Insert genus failed: ${result.error.message}`);
	remainingIds.genera.push(id);
	return result.data![0];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deleteRows', () => {
	// ── Basic Deletion ─────────────────────────────────────────────────────────

	describe('basic deletion', () => {
		it('should delete a single row by ID', async () => {
			const unit = await insertUnit();

			const result = await deleteRows('units', supabase, (q) =>
				q.eq('id', unit.id),
			);

			expect(result.success).toBe(true);
			expect(result.error).toBeNull();
			expect(result.count).toBe(1);

			// Verify the row is actually gone
			const { data } = await supabase
				.from('units')
				.select('id')
				.eq('id', unit.id);
			expect(data).toEqual([]);

			// Remove from cleanup since it's already deleted
			remainingIds.units = remainingIds.units.filter((id) => id !== unit.id);
		});

		it('should delete multiple rows matching a filter', async () => {
			const units = await Promise.all([
				insertUnit({ unit_name: 'BatchDelete_1' }),
				insertUnit({ unit_name: 'BatchDelete_2' }),
				insertUnit({ unit_name: 'BatchDelete_3' }),
			]);
			const ids = units.map((u) => u.id);

			const result = await deleteRows('units', supabase, (q) =>
				q.in('id', ids),
			);

			expect(result.success).toBe(true);
			expect(result.error).toBeNull();
			expect(result.count).toBe(3);

			// Verify all rows are gone
			const { data } = await supabase.from('units').select('id').in('id', ids);
			expect(data).toEqual([]);

			remainingIds.units = remainingIds.units.filter((id) => !ids.includes(id));
		});

		it('should succeed (no-op) when filter matches no rows', async () => {
			const result = await deleteRows('units', supabase, (q) =>
				q.eq('id', randomUUID()),
			);

			// Deleting 0 rows is still a success
			expect(result.success).toBe(true);
			expect(result.error).toBeNull();
			expect(result.count).toBe(0);
		});
	});

	// ── Filter Variations ──────────────────────────────────────────────────────

	describe('filter variations', () => {
		it('should delete using eq filter on a text column', async () => {
			const uniqueName = `Unique_Delete_${randomUUID().slice(0, 8)}`;
			const tg = await insertTagGroup(uniqueName);

			const result = await deleteRows('tag_groups', supabase, (q) =>
				q.eq('tag_group_name', uniqueName),
			);

			expect(result.success).toBe(true);

			const { data } = await supabase
				.from('tag_groups')
				.select('id')
				.eq('id', tg.id);
			expect(data).toEqual([]);

			remainingIds.tag_groups = remainingIds.tag_groups.filter(
				(id) => id !== tg.id,
			);
		});

		it('should delete using ilike filter', async () => {
			const prefix = `IlikeDelete_${randomUUID().slice(0, 6)}`;
			const tg1 = await insertTagGroup(`${prefix}_one`);
			const tg2 = await insertTagGroup(`${prefix}_two`);
			const tg3 = await insertTagGroup('Keep This One');

			const result = await deleteRows('tag_groups', supabase, (q) =>
				q.ilike('tag_group_name', `${prefix}%`),
			);

			expect(result.success).toBe(true);

			// The pattern-matched ones should be gone
			const { data: deleted } = await supabase
				.from('tag_groups')
				.select('id')
				.in('id', [tg1.id, tg2.id]);
			expect(deleted).toEqual([]);

			// The non-matching one should remain
			const { data: kept } = await supabase
				.from('tag_groups')
				.select('id')
				.eq('id', tg3.id);
			expect(kept!.length).toBe(1);

			remainingIds.tag_groups = remainingIds.tag_groups.filter(
				(id) => id !== tg1.id && id !== tg2.id,
			);
		});

		it('should delete using neq filter', async () => {
			const tg1 = await insertTagGroup();
			const tg2 = await insertTagGroup();

			// Delete everything except tg1
			const result = await deleteRows('tag_groups', supabase, (q) =>
				q.in('id', [tg1.id, tg2.id]).neq('id', tg1.id),
			);

			expect(result.success).toBe(true);

			// tg2 should be deleted, tg1 should remain
			const { data } = await supabase
				.from('tag_groups')
				.select('id')
				.in('id', [tg1.id, tg2.id]);
			expect(data!.length).toBe(1);
			expect(data![0].id).toBe(tg1.id);

			remainingIds.tag_groups = remainingIds.tag_groups.filter(
				(id) => id !== tg2.id,
			);
		});
	});

	// ── Foreign Key Constraints ────────────────────────────────────────────────

	describe('foreign key constraints', () => {
		it('should fail when deleting a row referenced by a foreign key', async () => {
			// Create a genus
			const genus = await insertGenus();

			// Create a species referencing the genus
			const speciesId = randomUUID();
			await insert(
				'species',
				SpeciesBaseRowSchema,
				SpeciesInsertSchema,
				supabase,
				[
					{
						id: speciesId,
						species_name: 'FK Protected Species',
						genus_id: genus.id,
						description: null,
					},
				],
			);
			remainingIds.species.push(speciesId);

			// Try to delete the genus (should fail due to FK from species)
			const result = await deleteRows('genera', supabase, (q) =>
				q.eq('id', genus.id),
			);

			expect(result.success).toBe(false);
			expect(result.error).not.toBeNull();

			// Genus should still exist
			const { data } = await supabase
				.from('genera')
				.select('id')
				.eq('id', genus.id);
			expect(data!.length).toBe(1);
		});

		it('should succeed when deleting a row with no FK references', async () => {
			const genus = await insertGenus();

			const result = await deleteRows('genera', supabase, (q) =>
				q.eq('id', genus.id),
			);

			expect(result.success).toBe(true);
			expect(result.error).toBeNull();

			remainingIds.genera = remainingIds.genera.filter((id) => id !== genus.id);
		});

		it('should succeed when deleting child rows first, then parent', async () => {
			// Create genus -> species chain
			const genus = await insertGenus();
			const speciesId = randomUUID();
			await insert(
				'species',
				SpeciesBaseRowSchema,
				SpeciesInsertSchema,
				supabase,
				[
					{
						id: speciesId,
						species_name: 'Deleteable Species',
						genus_id: genus.id,
						description: null,
					},
				],
			);
			remainingIds.species.push(speciesId);

			// Delete species first
			const speciesResult = await deleteRows('species', supabase, (q) =>
				q.eq('id', speciesId),
			);
			expect(speciesResult.success).toBe(true);
			remainingIds.species = remainingIds.species.filter(
				(id) => id !== speciesId,
			);

			// Now delete genus
			const genusResult = await deleteRows('genera', supabase, (q) =>
				q.eq('id', genus.id),
			);
			expect(genusResult.success).toBe(true);
			remainingIds.genera = remainingIds.genera.filter((id) => id !== genus.id);
		});
	});

	// ── Edge Cases ─────────────────────────────────────────────────────────────

	describe('edge cases', () => {
		it('should handle deleting from a table with many rows', async () => {
			const ids: string[] = [];
			const rows = Array.from({ length: 50 }, (_, i) => {
				const id = randomUUID();
				ids.push(id);
				return {
					id,
					unit_name: `BulkDelete_${i}`,
					abbreviation: `BD${i}`,
					base_unit_id: null,
					conversion_factor: null,
					conversion_offset: null,
					unit_system: null,
					unit_type: null,
				};
			});

			await supabase.from('units').insert(rows);
			remainingIds.units.push(...ids);

			const result = await deleteRows('units', supabase, (q) =>
				q.in('id', ids),
			);

			expect(result.success).toBe(true);

			const { data } = await supabase.from('units').select('id').in('id', ids);
			expect(data).toEqual([]);

			remainingIds.units = remainingIds.units.filter((id) => !ids.includes(id));
		});

		it('should handle concurrent deletes without errors', async () => {
			const u1 = await insertUnit();
			const u2 = await insertUnit();

			const [r1, r2] = await Promise.all([
				deleteRows('units', supabase, (q) => q.eq('id', u1.id)),
				deleteRows('units', supabase, (q) => q.eq('id', u2.id)),
			]);

			expect(r1.success).toBe(true);
			expect(r2.success).toBe(true);

			remainingIds.units = remainingIds.units.filter(
				(id) => id !== u1.id && id !== u2.id,
			);
		});

		it('should not affect other rows when deleting specific rows', async () => {
			const keep = await insertUnit({ unit_name: 'KeepMe' });
			const remove = await insertUnit({ unit_name: 'RemoveMe' });

			await deleteRows('units', supabase, (q) => q.eq('id', remove.id));
			remainingIds.units = remainingIds.units.filter((id) => id !== remove.id);

			// Verify the kept row still exists
			const { data } = await supabase
				.from('units')
				.select('*')
				.eq('id', keep.id)
				.single();

			expect(data).not.toBeNull();
			expect(data!.unit_name).toBe('KeepMe');
		});

		it('should return success: true when re-deleting already deleted rows', async () => {
			const unit = await insertUnit();

			// First delete
			await deleteRows('units', supabase, (q) => q.eq('id', unit.id));
			remainingIds.units = remainingIds.units.filter((id) => id !== unit.id);

			// Second delete of same ID (row no longer exists)
			const result = await deleteRows('units', supabase, (q) =>
				q.eq('id', unit.id),
			);

			// Should still be success (0 rows affected is not an error)
			expect(result.success).toBe(true);
			expect(result.error).toBeNull();
		});
	});

	// ── Dangerous Delete Prevention ────────────────────────────────────────────

	describe('dangerous delete scenarios', () => {
		it('should require a filter to be provided (function signature enforces this)', async () => {
			// The deleteRows function requires a filter parameter.
			// This test verifies the filter is actually applied by checking
			// that only filtered rows are deleted, not the entire table.
			const u1 = await insertUnit({ unit_name: 'Safe_1' });
			const u2 = await insertUnit({ unit_name: 'Safe_2' });
			const u3 = await insertUnit({ unit_name: 'Target' });

			await deleteRows('units', supabase, (q) => q.eq('id', u3.id));
			remainingIds.units = remainingIds.units.filter((id) => id !== u3.id);

			// u1 and u2 should still exist
			const { data } = await supabase
				.from('units')
				.select('id')
				.in('id', [u1.id, u2.id]);
			expect(data!.length).toBe(2);
		});
	});

	// ── Group-Scoped Deletion ──────────────────────────────────────────────────

	describe('group-scoped deletion', () => {
		it('should delete rows scoped to a specific group', async () => {
			// Create two groups
			const g1Id = randomUUID();
			const g2Id = randomUUID();
			await supabase.from('groups').insert([
				{
					id: g1Id,
					group_name: 'Delete Group 1',
					address: '1 St',
					phone: '555-1111',
				},
				{
					id: g2Id,
					group_name: 'Delete Group 2',
					address: '2 St',
					phone: '555-2222',
				},
			]);
			remainingIds.groups.push(g1Id, g2Id);

			// Create tag_groups for tags
			const tgId = randomUUID();
			await supabase
				.from('tag_groups')
				.insert({ id: tgId, tag_group_name: 'DeleteTagGroup' });
			remainingIds.tag_groups.push(tgId);

			// Create tags for both groups
			const tag1Id = randomUUID();
			const tag2Id = randomUUID();
			await supabase.from('tags').insert([
				{
					id: tag1Id,
					tag_name: 'G1 Tag',
					group_id: g1Id,
					tag_group_id: tgId,
					color: null,
				},
				{
					id: tag2Id,
					tag_name: 'G2 Tag',
					group_id: g2Id,
					tag_group_id: tgId,
					color: null,
				},
			]);
			remainingIds.tags.push(tag1Id, tag2Id);

			// Delete only group 1's tags
			const result = await deleteRows('tags', supabase, (q) =>
				q.eq('group_id', g1Id),
			);
			expect(result.success).toBe(true);
			remainingIds.tags = remainingIds.tags.filter((id) => id !== tag1Id);

			// Verify g2's tag still exists
			const { data } = await supabase
				.from('tags')
				.select('id')
				.eq('id', tag2Id);
			expect(data!.length).toBe(1);
		});
	});
});
