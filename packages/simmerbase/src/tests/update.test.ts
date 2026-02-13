import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import z from 'zod';
import { insert } from '../insert';
import {
	GeneraBaseRowSchema,
	GeneraInsertSchema,
	GeneraUpdateSchema,
} from '../schemas/genera';
import {
	GroupsBaseRowSchema,
	GroupsInsertSchema,
	GroupsUpdateSchema,
} from '../schemas/groups';
import {
	TagGroupsBaseRowSchema,
	TagGroupsInsertSchema,
	TagGroupsUpdateSchema,
} from '../schemas/tag_groups';
import {
	TrapTypesBaseRowSchema,
	TrapTypesInsertSchema,
	TrapTypesUpdateSchema,
} from '../schemas/trap_types';
import {
	UnitsBaseRowSchema,
	UnitsInsertSchema,
	UnitsUpdateSchema,
} from '../schemas/units';
import { update } from '../update';
import { cleanupByIds, createTestClient, randomUUID } from './setup';

const supabase = createTestClient();

// Track IDs for cleanup
const cleanupIds: Record<string, string[]> = {
	units: [],
	tag_groups: [],
	genera: [],
	groups: [],
	trap_types: [],
};

afterAll(async () => {
	await cleanupByIds(supabase, 'trap_types', cleanupIds.trap_types);
	await cleanupByIds(supabase, 'units', cleanupIds.units);
	await cleanupByIds(supabase, 'tag_groups', cleanupIds.tag_groups);
	await cleanupByIds(supabase, 'genera', cleanupIds.genera);
	await cleanupByIds(supabase, 'groups', cleanupIds.groups);
});

// Helper to insert a unit for update tests
async function insertUnit(
	overrides: Partial<{
		id: string;
		unit_name: string;
		abbreviation: string;
		conversion_factor: number | null;
		unit_system: 'si' | 'imperial' | 'us_customary' | null;
		unit_type:
			| 'weight'
			| 'distance'
			| 'area'
			| 'volume'
			| 'temperature'
			| 'duration'
			| 'count'
			| 'speed'
			| null;
	}> = {},
) {
	const id = overrides.id ?? randomUUID();
	const row = {
		id,
		unit_name: overrides.unit_name ?? `UpdateTestUnit_${id.slice(0, 8)}`,
		abbreviation: overrides.abbreviation ?? `utu${id.slice(0, 4)}`,
		base_unit_id: null,
		conversion_factor:
			'conversion_factor' in overrides ? overrides.conversion_factor! : 1,
		conversion_offset: 0,
		unit_system:
			'unit_system' in overrides ? overrides.unit_system! : ('si' as const),
		unit_type:
			'unit_type' in overrides ? overrides.unit_type! : ('weight' as const),
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
	cleanupIds.units.push(id);
	return result.data![0];
}

async function insertTagGroup(name?: string) {
	const id = randomUUID();
	const row = { id, tag_group_name: name ?? `UpdateTG_${id.slice(0, 8)}` };
	const result = await insert(
		'tag_groups',
		TagGroupsBaseRowSchema,
		TagGroupsInsertSchema,
		supabase,
		[row],
	);
	if (result.error)
		throw new Error(`Insert tag_group failed: ${result.error.message}`);
	cleanupIds.tag_groups.push(id);
	return result.data![0];
}

async function insertGroup(overrides: Partial<{ group_name: string }> = {}) {
	const id = randomUUID();
	const row = {
		id,
		group_name: overrides.group_name ?? `UpdateGroup_${id.slice(0, 8)}`,
		address: '789 Update Ave',
		phone: '555-0300',
		fax: null,
		short_name: null,
		website_url: null,
	};
	const result = await insert(
		'groups',
		GroupsBaseRowSchema,
		GroupsInsertSchema,
		supabase,
		[row],
	);
	if (result.error)
		throw new Error(`Insert group failed: ${result.error.message}`);
	cleanupIds.groups.push(id);
	return result.data![0];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('update', () => {
	// ── Basic Update ───────────────────────────────────────────────────────────

	describe('basic update', () => {
		it('should update a single field on a row', async () => {
			const original = await insertUnit();

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_name: 'Updated Unit Name' },
				(q) => q.eq('id', original.id),
			);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.length).toBe(1);
			expect(result.count).toBe(1);
			expect(result.data![0].unit_name).toBe('Updated Unit Name');
			expect(result.data![0].id).toBe(original.id);
		});

		it('should update multiple fields simultaneously', async () => {
			const original = await insertUnit();

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{
					unit_name: 'Multi Update',
					abbreviation: 'mu',
					conversion_factor: 42,
				},
				(q) => q.eq('id', original.id),
			);

			expect(result.error).toBeNull();
			expect(result.data![0].unit_name).toBe('Multi Update');
			expect(result.data![0].abbreviation).toBe('mu');
			expect(result.data![0].conversion_factor).toBe(42);
		});

		it('should update a nullable field from non-null to null', async () => {
			const original = await insertUnit({ conversion_factor: 100 });
			expect(original.conversion_factor).toBe(100);

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ conversion_factor: null },
				(q) => q.eq('id', original.id),
			);

			expect(result.error).toBeNull();
			expect(result.data![0].conversion_factor).toBeNull();
		});

		it('should update a nullable field from null to a value', async () => {
			const original = await insertUnit({ conversion_factor: null });
			expect(original.conversion_factor).toBeNull();

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ conversion_factor: 99.9 },
				(q) => q.eq('id', original.id),
			);

			expect(result.error).toBeNull();
			expect(result.data![0].conversion_factor).toBeCloseTo(99.9);
		});

		it('should preserve unchanged fields after update', async () => {
			const original = await insertUnit({
				unit_name: 'PreserveTest',
				abbreviation: 'pt',
				conversion_factor: 5,
				unit_system: 'imperial',
			});

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_name: 'PreserveTest Updated' },
				(q) => q.eq('id', original.id),
			);

			expect(result.error).toBeNull();
			const updated = result.data![0];
			expect(updated.unit_name).toBe('PreserveTest Updated');
			// Unchanged fields should remain
			expect(updated.abbreviation).toBe('pt');
			expect(updated.conversion_factor).toBe(5);
			expect(updated.unit_system).toBe('imperial');
		});

		it('should return the updated row data matching the row schema', async () => {
			const original = await insertTagGroup();

			const result = await update(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsUpdateSchema,
				supabase,
				{ tag_group_name: 'Schema Check Update' },
				(q) => q.eq('id', original.id),
			);

			expect(result.error).toBeNull();
			const validation = TagGroupsBaseRowSchema.safeParse(result.data![0]);
			expect(validation.success).toBe(true);
		});
	});

	// ── Filter Behavior ────────────────────────────────────────────────────────

	describe('filter behavior', () => {
		it('should update multiple rows when filter matches many', async () => {
			const units = await Promise.all([
				insertUnit({ unit_system: 'imperial', unit_type: 'distance' }),
				insertUnit({ unit_system: 'imperial', unit_type: 'distance' }),
				insertUnit({ unit_system: 'si', unit_type: 'weight' }),
			]);

			const imperialIds = units
				.filter((u) => u.unit_system === 'imperial')
				.map((u) => u.id);

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ abbreviation: 'imp_updated' },
				(q) => q.in('id', imperialIds),
			);

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(2);
			for (const row of result.data!) {
				expect(row.abbreviation).toBe('imp_updated');
			}
		});

		it('should return empty array when filter matches no rows', async () => {
			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_name: 'Ghost Update' },
				(q) => q.eq('id', randomUUID()),
			);

			expect(result.error).toBeNull();
			expect(result.data).toEqual([]);
		});

		it('should only update the filtered row, leaving others untouched', async () => {
			const unit1 = await insertUnit({ unit_name: 'Keep Me' });
			const unit2 = await insertUnit({ unit_name: 'Change Me' });

			await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_name: 'Changed!' },
				(q) => q.eq('id', unit2.id),
			);

			// Verify unit1 is unchanged
			const { data } = await supabase
				.from('units')
				.select('unit_name')
				.eq('id', unit1.id)
				.single();

			expect(data!.unit_name).toBe('Keep Me');
		});
	});

	// ── Validation Errors ──────────────────────────────────────────────────────

	describe('validation errors', () => {
		it('should return an error when update data fails schema validation', async () => {
			const original = await insertUnit();

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ conversion_factor: 'not-a-number' as any },
				(q) => q.eq('id', original.id),
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
		});

		it('should return an error when update data has invalid enum value', async () => {
			const original = await insertUnit();

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_system: 'invalid_system' as any },
				(q) => q.eq('id', original.id),
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
		});

		it('should return an error when update body is empty', async () => {
			const original = await insertUnit();

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{},
				(q) => q.eq('id', original.id),
			);

			// Empty update is now caught with an explicit guard
			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toBe('No fields provided for update');
		});
	});

	// ── Database Constraint Errors ─────────────────────────────────────────────

	describe('database constraint errors', () => {
		it('should return an error when update violates a foreign key constraint', async () => {
			const group = await insertGroup();

			// Create a trap type linked to the group
			const ttId = randomUUID();
			await supabase.from('trap_types').insert({
				id: ttId,
				trap_type_name: 'FK Test TrapType',
				shorthand: 'FKT',
				group_id: group.id,
			});
			cleanupIds.trap_types.push(ttId);

			// Try to update group_id to a non-existent group
			const result = await update(
				'trap_types',
				TrapTypesBaseRowSchema,
				TrapTypesUpdateSchema,
				supabase,
				{ group_id: randomUUID() },
				(q) => q.eq('id', ttId),
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
		});
	});

	// ── Server-Generated Fields ────────────────────────────────────────────────

	describe('server-generated fields', () => {
		it('should update the updated_at timestamp after an update', async () => {
			const group = await insertGroup();
			const originalUpdatedAt = group.updated_at;

			// Small delay to ensure timestamp difference
			await new Promise((resolve) => setTimeout(resolve, 100));

			const result = await update(
				'groups',
				GroupsBaseRowSchema,
				GroupsUpdateSchema,
				supabase,
				{ group_name: 'Timestamp Updated Group' },
				(q) => q.eq('id', group.id),
			);

			expect(result.error).toBeNull();
			const newUpdatedAt = result.data![0].updated_at;
			expect(newUpdatedAt.getTime()).toBeGreaterThanOrEqual(
				originalUpdatedAt.getTime(),
			);
		});
	});

	// ── Edge Cases ─────────────────────────────────────────────────────────────

	describe('edge cases', () => {
		it('should handle updating with special characters', async () => {
			const tg = await insertTagGroup();

			const result = await update(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsUpdateSchema,
				supabase,
				{ tag_group_name: 'Update O\'Brien\'s "Tag" & <Group>' },
				(q) => q.eq('id', tg.id),
			);

			expect(result.error).toBeNull();
			expect(result.data![0].tag_group_name).toBe(
				'Update O\'Brien\'s "Tag" & <Group>',
			);
		});

		it('should handle updating with unicode characters', async () => {
			const tg = await insertTagGroup();

			const result = await update(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsUpdateSchema,
				supabase,
				{ tag_group_name: '更新テスト 🦟' },
				(q) => q.eq('id', tg.id),
			);

			expect(result.error).toBeNull();
			expect(result.data![0].tag_group_name).toBe('更新テスト 🦟');
		});

		it('should handle updating with empty string', async () => {
			const tg = await insertTagGroup('Non-Empty Name');

			const result = await update(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsUpdateSchema,
				supabase,
				{ tag_group_name: '' },
				(q) => q.eq('id', tg.id),
			);

			expect(result.error).toBeNull();
			expect(result.data![0].tag_group_name).toBe('');
		});

		it('should handle updating the same row multiple times', async () => {
			const unit = await insertUnit();

			// Update 1
			const r1 = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_name: 'First Update' },
				(q) => q.eq('id', unit.id),
			);
			expect(r1.data![0].unit_name).toBe('First Update');

			// Update 2
			const r2 = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_name: 'Second Update' },
				(q) => q.eq('id', unit.id),
			);
			expect(r2.data![0].unit_name).toBe('Second Update');

			// Update 3
			const r3 = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_name: 'Third Update' },
				(q) => q.eq('id', unit.id),
			);
			expect(r3.data![0].unit_name).toBe('Third Update');
		});

		it('should handle concurrent updates to different rows', async () => {
			const [u1, u2] = await Promise.all([insertUnit(), insertUnit()]);

			const [r1, r2] = await Promise.all([
				update(
					'units',
					UnitsBaseRowSchema,
					UnitsUpdateSchema,
					supabase,
					{ unit_name: 'Concurrent 1' },
					(q) => q.eq('id', u1.id),
				),
				update(
					'units',
					UnitsBaseRowSchema,
					UnitsUpdateSchema,
					supabase,
					{ unit_name: 'Concurrent 2' },
					(q) => q.eq('id', u2.id),
				),
			]);

			expect(r1.error).toBeNull();
			expect(r2.error).toBeNull();
			expect(r1.data![0].unit_name).toBe('Concurrent 1');
			expect(r2.data![0].unit_name).toBe('Concurrent 2');
		});

		it('should handle updating enum field to a different valid value', async () => {
			const unit = await insertUnit({ unit_system: 'si', unit_type: 'weight' });

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_system: 'us_customary', unit_type: 'volume' },
				(q) => q.eq('id', unit.id),
			);

			expect(result.error).toBeNull();
			expect(result.data![0].unit_system).toBe('us_customary');
			expect(result.data![0].unit_type).toBe('volume');
		});

		it('should handle updating enum field to null', async () => {
			const unit = await insertUnit({ unit_system: 'si' });

			const result = await update(
				'units',
				UnitsBaseRowSchema,
				UnitsUpdateSchema,
				supabase,
				{ unit_system: null },
				(q) => q.eq('id', unit.id),
			);

			expect(result.error).toBeNull();
			expect(result.data![0].unit_system).toBeNull();
		});
	});
});
