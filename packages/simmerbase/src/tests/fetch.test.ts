import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import z from 'zod';
import type { Database } from '../database.types';
import { fetch } from '../fetch';
import { GeneraBaseRowSchema } from '../schemas/genera';
import { GroupsBaseRowSchema } from '../schemas/groups';
import { TagGroupsBaseRowSchema } from '../schemas/tag_groups';
import { TrapTypesBaseRowSchema } from '../schemas/trap_types';
import { type UnitsBaseRow, UnitsBaseRowSchema } from '../schemas/units';
import { cleanupByIds, createTestClient, randomUUID } from './setup';

const supabase = createTestClient();

// ─── Seed data helpers ───────────────────────────────────────────────────────

const seededUnitIds: string[] = [];
const seededTagGroupIds: string[] = [];
const seededGeneraIds: string[] = [];
const seededGroupIds: string[] = [];
const seededTrapTypeIds: string[] = [];

async function seedUnits(count: number): Promise<string[]> {
	const ids: string[] = [];
	const rows = Array.from({ length: count }, (_, i) => {
		const id = randomUUID();
		ids.push(id);
		return {
			id,
			unit_name: `Test Unit ${id.slice(0, 8)}`,
			abbreviation: `tu${i}`,
			base_unit_id: null,
			conversion_factor: i + 1,
			conversion_offset: 0,
			unit_system: 'si' as const,
			unit_type: 'weight' as const,
		};
	});
	const { error } = await supabase.from('units').insert(rows);
	if (error) throw new Error(`Seed units failed: ${error.message}`);
	seededUnitIds.push(...ids);
	return ids;
}

async function seedTagGroups(count: number): Promise<string[]> {
	const ids: string[] = [];
	const rows = Array.from({ length: count }, () => {
		const id = randomUUID();
		ids.push(id);
		return { id, tag_group_name: `Test TG ${id.slice(0, 8)}` };
	});
	const { error } = await supabase.from('tag_groups').insert(rows);
	if (error) throw new Error(`Seed tag_groups failed: ${error.message}`);
	seededTagGroupIds.push(...ids);
	return ids;
}

async function seedGenera(count: number): Promise<string[]> {
	const ids: string[] = [];
	const rows = Array.from({ length: count }, (_, i) => {
		const id = randomUUID();
		ids.push(id);
		return {
			id,
			genus_name: `TestGenus${id.slice(0, 8)}`,
			abbreviation: `TG${id.slice(0, 6)}`,
			description: i % 2 === 0 ? `Description ${i}` : null,
		};
	});
	const { error } = await supabase.from('genera').insert(rows);
	if (error) throw new Error(`Seed genera failed: ${error.message}`);
	seededGeneraIds.push(...ids);
	return ids;
}

async function seedGroups(count: number): Promise<string[]> {
	const ids: string[] = [];
	const rows = Array.from({ length: count }, () => {
		const id = randomUUID();
		ids.push(id);
		return {
			id,
			group_name: `Test Group ${id.slice(0, 8)}`,
			address: '123 Test Street',
			phone: '555-0100',
			fax: null,
			short_name: null,
			website_url: null,
		};
	});
	const { error } = await supabase.from('groups').insert(rows);
	if (error) throw new Error(`Seed groups failed: ${error.message}`);
	seededGroupIds.push(...ids);
	return ids;
}

async function seedTrapTypes(
	groupId: string | null,
	count: number,
): Promise<string[]> {
	const ids: string[] = [];
	const rows = Array.from({ length: count }, (_, i) => {
		const id = randomUUID();
		ids.push(id);
		return {
			id,
			trap_type_name: `Test TrapType ${id.slice(0, 8)}`,
			shorthand: `TT${i}`,
			group_id: groupId,
		};
	});
	const { error } = await supabase.from('trap_types').insert(rows);
	if (error) throw new Error(`Seed trap_types failed: ${error.message}`);
	seededTrapTypeIds.push(...ids);
	return ids;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

afterAll(async () => {
	await cleanupByIds(supabase, 'trap_types', seededTrapTypeIds);
	await cleanupByIds(supabase, 'units', seededUnitIds);
	await cleanupByIds(supabase, 'tag_groups', seededTagGroupIds);
	await cleanupByIds(supabase, 'genera', seededGeneraIds);
	await cleanupByIds(supabase, 'groups', seededGroupIds);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('fetch', () => {
	// ── Basic Fetch ────────────────────────────────────────────────────────────

	describe('basic fetch (no options)', () => {
		it('should fetch all rows from a table', async () => {
			const ids = await seedUnits(3);

			const result = await fetch('units', UnitsBaseRowSchema, supabase);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.length).toBeGreaterThanOrEqual(3);

			// Verify our seeded data is present
			const fetchedIds = result.data!.map((r) => r.id);
			for (const id of ids) {
				expect(fetchedIds).toContain(id);
			}
		});

		it('should return an empty array when the table has no matching rows', async () => {
			// Use a filter that matches nothing
			const result = await fetch(
				'tag_groups',
				TagGroupsBaseRowSchema,
				supabase,
				{
					filter: (q) => q.eq('id', randomUUID()),
				},
			);

			expect(result.error).toBeNull();
			expect(result.data).toEqual([]);
		});

		it('should return data matching the schema shape', async () => {
			await seedGenera(1);

			const result = await fetch('genera', GeneraBaseRowSchema, supabase);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();

			const row = result.data![0];
			expect(row).toHaveProperty('id');
			expect(row).toHaveProperty('genus_name');
			expect(row).toHaveProperty('abbreviation');
			expect(row).toHaveProperty('description');
		});
	});

	// ── Schema Validation ──────────────────────────────────────────────────────

	describe('schema validation', () => {
		it('should only select columns defined in the schema', async () => {
			await seedUnits(1);

			// Use a partial schema - only request id and unit_name
			const PartialSchema = z.object({
				id: z.string(),
				unit_name: z.string(),
			});

			const result = await fetch('units', PartialSchema, supabase);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();

			const row = result.data![0];
			expect(Object.keys(row)).toEqual(['id', 'unit_name']);
			// Should NOT have abbreviation, conversion_factor, etc.
			expect(row).not.toHaveProperty('abbreviation');
			expect(row).not.toHaveProperty('conversion_factor');
		});

		it('should return an error when schema validation fails on returned data', async () => {
			await seedUnits(1);

			// Schema expects a number for 'unit_name' but DB returns a string
			const BadSchema = z.object({
				id: z.string(),
				unit_name: z.number(), // type mismatch - DB has string
			});

			const result = await fetch('units', BadSchema, supabase);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
		});

		it('should succeed with a schema that has coerced types', async () => {
			const groupIds = await seedGroups(1);

			// Groups have created_at as string in DB, but schema coerces to Date
			const result = await fetch('groups', GroupsBaseRowSchema, supabase, {
				filter: (q) => q.eq('id', groupIds[0]),
			});

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data![0].created_at).toBeInstanceOf(Date);
		});

		it('should handle nullable fields correctly', async () => {
			await seedGenera(2);

			const result = await fetch('genera', GeneraBaseRowSchema, supabase);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();

			// We seeded with even indices having descriptions, odd having null
			const withDesc = result.data!.filter((r) => r.description !== null);
			const withoutDesc = result.data!.filter((r) => r.description === null);
			expect(withDesc.length).toBeGreaterThan(0);
			expect(withoutDesc.length).toBeGreaterThan(0);
		});
	});

	// ── Filtering ──────────────────────────────────────────────────────────────

	describe('filtering', () => {
		it('should apply a single filter function', async () => {
			const ids = await seedTagGroups(3);

			const result = await fetch(
				'tag_groups',
				TagGroupsBaseRowSchema,
				supabase,
				{
					filter: (q) => q.eq('id', ids[0]),
				},
			);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.length).toBe(1);
			expect(result.data![0].id).toBe(ids[0]);
		});

		it('should apply eq filter on string column', async () => {
			const [id] = await seedGenera(1);

			// Fetch back by the known genus_name
			const { data: inserted } = await supabase
				.from('genera')
				.select('genus_name')
				.eq('id', id)
				.single();

			const result = await fetch('genera', GeneraBaseRowSchema, supabase, {
				filter: (q) => q.eq('genus_name', inserted!.genus_name),
			});

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(1);
			expect(result.data![0].id).toBe(id);
		});

		it('should apply in filter for multiple values', async () => {
			const ids = await seedTagGroups(5);

			const targetIds = [ids[0], ids[2], ids[4]];
			const result = await fetch(
				'tag_groups',
				TagGroupsBaseRowSchema,
				supabase,
				{
					filter: (q) => q.in('id', targetIds),
				},
			);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.length).toBe(3);
			const fetchedIds = result.data!.map((r) => r.id);
			for (const target of targetIds) {
				expect(fetchedIds).toContain(target);
			}
		});

		it('should apply neq filter', async () => {
			const ids = await seedTagGroups(3);

			const result = await fetch(
				'tag_groups',
				TagGroupsBaseRowSchema,
				supabase,
				{
					filter: (q) => q.in('id', ids).neq('id', ids[0]),
				},
			);

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(2);
			expect(result.data!.map((r) => r.id)).not.toContain(ids[0]);
		});

		it('should apply ilike filter for partial text matching', async () => {
			const id = randomUUID();
			const uniqueName = `UniqueGenusXYZ_${id.slice(0, 8)}`;
			await supabase.from('genera').insert({
				id,
				genus_name: uniqueName,
				abbreviation: 'UX',
				description: null,
			});
			seededGeneraIds.push(id);

			const result = await fetch('genera', GeneraBaseRowSchema, supabase, {
				filter: (q) => q.ilike('genus_name', '%UniqueGenusXYZ%'),
			});

			expect(result.error).toBeNull();
			expect(result.data!.length).toBeGreaterThanOrEqual(1);
			expect(result.data!.some((r) => r.id === id)).toBe(true);
		});

		it('should return empty array when filter matches nothing', async () => {
			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.eq('unit_name', 'THIS_NAME_DOES_NOT_EXIST_EVER'),
			});

			expect(result.error).toBeNull();
			expect(result.data).toEqual([]);
		});

		it('should correctly handle the filter option when it is a single function (not array)', async () => {
			// The fetch function checks: Array.isArray(options.filter)
			// When filter is a single function, it should still work via the [options.filter] wrapping
			const ids = await seedUnits(2);

			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.eq('id', ids[0]),
			});

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(1);
		});
	});

	// ── Filter as Array (code path testing) ────────────────────────────────────

	describe('filter function (chained filters)', () => {
		it('should support chaining multiple filter conditions in a single function', async () => {
			const ids = await seedUnits(5);

			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.in('id', ids).eq('unit_type', 'weight'),
			});

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(5);
		});
	});

	// ── Pagination ─────────────────────────────────────────────────────────────

	describe('pagination', () => {
		let paginationUnitIds: string[];

		beforeAll(async () => {
			paginationUnitIds = await seedUnits(10);
		});

		it('should paginate results with from/to range', async () => {
			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.in('id', paginationUnitIds),
				pagination: {
					column: 'unit_name',
					ascending: true,
					from: 0,
					to: 4,
				},
			});

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.length).toBe(5); // 0 to 4 inclusive = 5 rows
		});

		it('should paginate with ascending order', async () => {
			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.in('id', paginationUnitIds),
				pagination: {
					column: 'unit_name',
					ascending: true,
					from: 0,
					to: 9,
				},
			});

			expect(result.error).toBeNull();
			const names = result.data!.map((r) => r.unit_name);
			const sorted = [...names].sort();
			expect(names).toEqual(sorted);
		});

		it('should paginate with descending order', async () => {
			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.in('id', paginationUnitIds),
				pagination: {
					column: 'unit_name',
					ascending: false,
					from: 0,
					to: 9,
				},
			});

			expect(result.error).toBeNull();
			const names = result.data!.map((r) => r.unit_name);
			const sorted = [...names].sort().reverse();
			expect(names).toEqual(sorted);
		});

		it('should default to ascending when ascending option is not provided', async () => {
			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.in('id', paginationUnitIds),
				pagination: {
					column: 'unit_name',
					from: 0,
					to: 9,
				},
			});

			expect(result.error).toBeNull();
			const names = result.data!.map((r) => r.unit_name);
			const sorted = [...names].sort();
			expect(names).toEqual(sorted);
		});

		it('should return a subset when range is smaller than total', async () => {
			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.in('id', paginationUnitIds),
				pagination: {
					column: 'unit_name',
					ascending: true,
					from: 2,
					to: 4,
				},
			});

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(3); // indices 2, 3, 4
		});

		it('should handle out-of-range pagination gracefully', async () => {
			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.in('id', paginationUnitIds),
				pagination: {
					column: 'unit_name',
					ascending: true,
					from: 100,
					to: 200,
				},
			});

			expect(result.error).toBeNull();
			expect(result.data).toEqual([]);
		});

		it('should combine filter and pagination correctly', async () => {
			// Filter to only weight units (all our seeded units are weight)
			const result = await fetch('units', UnitsBaseRowSchema, supabase, {
				filter: (q) => q.in('id', paginationUnitIds).eq('unit_type', 'weight'),
				pagination: {
					column: 'unit_name',
					ascending: true,
					from: 0,
					to: 2,
				},
			});

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(3);
			for (const row of result.data!) {
				expect(row.unit_type).toBe('weight');
			}
		});
	});

	// ── Edge Cases ─────────────────────────────────────────────────────────────

	describe('edge cases', () => {
		it('should handle fetching from table with only nullable optional fields in schema', async () => {
			const PartialSchema = z.object({
				id: z.string(),
				description: z.string().nullable(),
			});

			await seedGenera(1);

			const result = await fetch('genera', PartialSchema, supabase);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
		});

		it('should work with a schema requesting a single column', async () => {
			await seedTagGroups(2);

			const IdOnlySchema = z.object({ id: z.string() });

			const result = await fetch('tag_groups', IdOnlySchema, supabase);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.length).toBeGreaterThanOrEqual(2);
			expect(Object.keys(result.data![0])).toEqual(['id']);
		});

		it('should handle concurrent fetches without interference', async () => {
			await seedUnits(3);
			await seedGenera(3);

			const [unitsResult, generaResult] = await Promise.all([
				fetch('units', UnitsBaseRowSchema, supabase),
				fetch('genera', GeneraBaseRowSchema, supabase),
			]);

			expect(unitsResult.error).toBeNull();
			expect(generaResult.error).toBeNull();
			expect(unitsResult.data!.length).toBeGreaterThanOrEqual(3);
			expect(generaResult.data!.length).toBeGreaterThanOrEqual(3);
		});

		it('should handle a table with group_id scoping via filter', async () => {
			const groupIds = await seedGroups(2);
			const ttIds1 = await seedTrapTypes(groupIds[0], 2);
			const ttIds2 = await seedTrapTypes(groupIds[1], 3);

			const result = await fetch(
				'trap_types',
				TrapTypesBaseRowSchema,
				supabase,
				{
					filter: (q) => q.eq('group_id', groupIds[0]),
				},
			);

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(2);
			for (const row of result.data!) {
				expect(row.group_id).toBe(groupIds[0]);
			}
		});

		it('should return error: null and data: [] when table is empty and has no matches', async () => {
			const result = await fetch(
				'tag_groups',
				TagGroupsBaseRowSchema,
				supabase,
				{
					filter: (q) =>
						q.eq('tag_group_name', 'ABSOLUTELY_IMPOSSIBLE_NAME_XXXXXXXXXXX'),
				},
			);

			expect(result.error).toBeNull();
			expect(result.data).toEqual([]);
		});
	});
});
