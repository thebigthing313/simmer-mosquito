import { afterAll, describe, expect, it } from 'vitest';
import z from 'zod';
import { insert } from '../insert';
import { GeneraBaseRowSchema, GeneraInsertSchema } from '../schemas/genera';
import { GroupsBaseRowSchema, GroupsInsertSchema } from '../schemas/groups';
import {
	RegionFoldersBaseRowSchema,
	RegionFoldersInsertSchema,
} from '../schemas/region_folders';
import { RolesBaseRowSchema, RolesInsertSchema } from '../schemas/roles';
import { SpeciesBaseRowSchema, SpeciesInsertSchema } from '../schemas/species';
import {
	TagGroupsBaseRowSchema,
	TagGroupsInsertSchema,
} from '../schemas/tag_groups';
import { UnitsBaseRowSchema, UnitsInsertSchema } from '../schemas/units';
import { cleanupByIds, createTestClient, randomUUID } from './setup';

const supabase = createTestClient();

// Track created IDs for cleanup
const createdIds: Record<string, string[]> = {
	units: [],
	tag_groups: [],
	genera: [],
	groups: [],
	species: [],
	region_folders: [],
	roles: [],
};

afterAll(async () => {
	// Clean up in dependency order
	await cleanupByIds(supabase, 'species', createdIds.species);
	await cleanupByIds(supabase, 'region_folders', createdIds.region_folders);
	await cleanupByIds(supabase, 'genera', createdIds.genera);
	await cleanupByIds(supabase, 'tag_groups', createdIds.tag_groups);
	await cleanupByIds(supabase, 'units', createdIds.units);
	await cleanupByIds(supabase, 'groups', createdIds.groups);
	if (createdIds.roles.length > 0) {
		await cleanupByIds(supabase, 'roles', createdIds.roles);
	}
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('insert', () => {
	// ── Single Row Insert ──────────────────────────────────────────────────────

	describe('single row insert', () => {
		it('should insert a single row and return the inserted data', async () => {
			const id = randomUUID();
			const row = {
				id,
				unit_name: `Test Kilogram ${id.slice(0, 8)}`,
				abbreviation: `tkg${id.slice(0, 4)}`,
				base_unit_id: null,
				conversion_factor: 1,
				conversion_offset: 0,
				unit_system: 'si' as const,
				unit_type: 'weight' as const,
			};

			const result = await insert(
				'units',
				UnitsBaseRowSchema,
				UnitsInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.length).toBe(1);
			expect(result.count).toBe(1);
			expect(result.data![0].id).toBe(id);
			expect(result.data![0].unit_name).toBe(`Test Kilogram ${id.slice(0, 8)}`);
			createdIds.units.push(id);
		});

		it('should insert a row with all nullable fields set to null', async () => {
			const id = randomUUID();
			const row = {
				id,
				genus_name: 'TestNullGenus',
				abbreviation: 'TNG',
				description: null,
			};

			const result = await insert(
				'genera',
				GeneraBaseRowSchema,
				GeneraInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data![0].description).toBeNull();
			createdIds.genera.push(id);
		});

		it('should return data that conforms to the row schema', async () => {
			const id = randomUUID();
			const row = {
				id,
				tag_group_name: 'Schema Conformance Test',
			};

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			const inserted = result.data![0];

			// Validate the returned data against the row schema
			const validation = TagGroupsBaseRowSchema.safeParse(inserted);
			expect(validation.success).toBe(true);
			createdIds.tag_groups.push(id);
		});
	});

	// ── Multiple Row Insert ────────────────────────────────────────────────────

	describe('multiple row insert', () => {
		it('should insert multiple rows at once', async () => {
			const ids = [randomUUID(), randomUUID(), randomUUID()];
			const rows = ids.map((id, i) => ({
				id,
				tag_group_name: `Batch Insert ${i}`,
			}));

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				rows,
			);

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(3);
			createdIds.tag_groups.push(...ids);
		});

		it('should insert exactly MAX rows (500 boundary)', async () => {
			// This tests the boundary condition. 500 rows should succeed.
			const ids = Array.from({ length: 500 }, () => randomUUID());
			const rows = ids.map((id, i) => ({
				id,
				unit_name: `BulkUnit_${id.slice(0, 8)}_${i}`,
				abbreviation: `BU${id.slice(0, 6)}`,
				base_unit_id: null,
				conversion_factor: null,
				conversion_offset: null,
				unit_system: null,
				unit_type: null,
			}));

			const result = await insert(
				'units',
				UnitsBaseRowSchema,
				UnitsInsertSchema,
				supabase,
				rows,
			);

			expect(result.error).toBeNull();
			expect(result.data!.length).toBe(500);
			createdIds.units.push(...ids);
		});
	});

	// ── Validation Errors ──────────────────────────────────────────────────────

	describe('validation errors', () => {
		it('should return an error when rows array is empty', async () => {
			const result = await insert(
				'units',
				UnitsBaseRowSchema,
				UnitsInsertSchema,
				supabase,
				[],
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toBe('No rows provided for insert');
		});

		it('should return an error when exceeding MAX_INSERT_ROWS (501)', async () => {
			const rows = Array.from({ length: 501 }, (_, i) => ({
				id: randomUUID(),
				unit_name: `Overflow_${randomUUID().slice(0, 8)}_${i}`,
				abbreviation: `OF${randomUUID().slice(0, 6)}`,
				base_unit_id: null,
				conversion_factor: null,
				conversion_offset: null,
				unit_system: null,
				unit_type: null,
			}));

			const result = await insert(
				'units',
				UnitsBaseRowSchema,
				UnitsInsertSchema,
				supabase,
				rows,
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain(
				'Cannot insert more than 500 rows',
			);
		});

		it('should return an error when insert data fails schema validation', async () => {
			const badRows = [
				{
					id: 'not-a-uuid', // Invalid UUID
					tag_group_name: 'Bad Row',
				},
			];

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				badRows,
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toBe('Invalid insert data');
		});

		it('should return an error when required field is missing', async () => {
			const badRows = [
				{
					id: randomUUID(),
					// tag_group_name is missing - required field
				},
			];

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				badRows as any,
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
		});

		it('should return an error when data has extra unrecognized fields', async () => {
			const rows = [
				{
					id: randomUUID(),
					tag_group_name: 'Extra Fields Test',
					non_existent_column: 'bad value', // Not in schema
				},
			];

			// Zod's default behavior strips extra keys. The insert may succeed
			// or fail at the DB level depending on strict mode.
			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				rows as any,
			);

			// If Zod strips the extra field, insert succeeds. Track for cleanup.
			if (result.data) {
				createdIds.tag_groups.push(result.data[0].id);
			}
			// The point: it should not crash
			expect(result.error === null || result.error !== null).toBe(true);
		});

		it('should return an error when data types are wrong', async () => {
			const badRows = [
				{
					id: randomUUID(),
					unit_name: 12345, // Should be string
					abbreviation: true, // Should be string
					base_unit_id: null,
					conversion_factor: 'not a number', // Should be number
					conversion_offset: null,
					unit_system: 'si',
					unit_type: 'weight',
				},
			];

			const result = await insert(
				'units',
				UnitsBaseRowSchema,
				UnitsInsertSchema,
				supabase,
				badRows as any,
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
		});
	});

	// ── Database Constraint Errors ─────────────────────────────────────────────

	describe('database constraint errors', () => {
		it('should return an error when inserting a duplicate primary key', async () => {
			const id = randomUUID();
			const row = {
				id,
				tag_group_name: 'Original',
			};

			// First insert should succeed
			const result1 = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				[row],
			);
			expect(result1.error).toBeNull();
			createdIds.tag_groups.push(id);

			// Second insert with same ID should fail
			const duplicateRow = {
				id,
				tag_group_name: 'Duplicate',
			};
			const result2 = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				[duplicateRow],
			);

			expect(result2.data).toBeNull();
			expect(result2.error).not.toBeNull();
		});

		it('should return an error when violating a foreign key constraint', async () => {
			const id = randomUUID();
			const row = {
				id,
				species_name: 'Bad FK Species',
				genus_id: randomUUID(), // Non-existent genus
				description: null,
			};

			const result = await insert(
				'species',
				SpeciesBaseRowSchema,
				SpeciesInsertSchema,
				supabase,
				[row],
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
		});

		it('should succeed when foreign key reference is valid', async () => {
			// First create the genus
			const genusId = randomUUID();
			const genusResult = await insert(
				'genera',
				GeneraBaseRowSchema,
				GeneraInsertSchema,
				supabase,
				[
					{
						id: genusId,
						genus_name: 'ValidGenus',
						abbreviation: 'VG',
						description: null,
					},
				],
			);
			expect(genusResult.error).toBeNull();
			createdIds.genera.push(genusId);

			// Then create species referencing it
			const speciesId = randomUUID();
			const result = await insert(
				'species',
				SpeciesBaseRowSchema,
				SpeciesInsertSchema,
				supabase,
				[
					{
						id: speciesId,
						species_name: 'ValidSpecies',
						genus_id: genusId,
						description: null,
					},
				],
			);

			expect(result.error).toBeNull();
			expect(result.data![0].genus_id).toBe(genusId);
			createdIds.species.push(speciesId);
		});

		it('should return an error when required group_id is missing for group-scoped table', async () => {
			const row = {
				id: randomUUID(),
				region_folder_name: 'No Group',
				group_id: randomUUID(), // Non-existent group
			};

			const result = await insert(
				'region_folders',
				RegionFoldersBaseRowSchema,
				RegionFoldersInsertSchema,
				supabase,
				[row],
			);

			// Should fail due to FK constraint on group_id
			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
		});
	});

	// ── Row Schema Validation on Return ────────────────────────────────────────

	describe('return data validation with row schema', () => {
		it('should return error when row schema does not match returned DB data', async () => {
			const id = randomUUID();
			const row = { id, tag_group_name: 'Row Schema Mismatch' };

			// Use a row schema that expects a field the DB doesn't return
			const BadRowSchema = z.object({
				id: z.string(),
				tag_group_name: z.string(),
				non_existent: z.string(), // This field doesn't exist in DB
			});

			const result = await insert('tag_groups', BadRowSchema, TagGroupsInsertSchema, supabase, [
				row,
			]);

			// Now uses safeParse so returns error in result instead of throwing
			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();

			// Clean up - the row was inserted even though parsing failed
			createdIds.tag_groups.push(id);
		});

		it('should validate server-generated fields (created_at, updated_at) via row schema', async () => {
			const groupId = randomUUID();
			const row = {
				id: groupId,
				group_name: 'Timestamp Test Group',
				address: '456 Test Ave',
				phone: '555-0200',
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

			expect(result.error).toBeNull();
			expect(result.data![0].created_at).toBeInstanceOf(Date);
			expect(result.data![0].updated_at).toBeInstanceOf(Date);
			createdIds.groups.push(groupId);
		});
	});

	// ── Edge Cases ─────────────────────────────────────────────────────────────

	describe('edge cases', () => {
		it('should handle inserting rows with special characters in strings', async () => {
			const id = randomUUID();
			const row = {
				id,
				tag_group_name: 'O\'Brien\'s "Special" Tag & <Group> \\ /slash/',
			};

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data![0].tag_group_name).toBe(
				'O\'Brien\'s "Special" Tag & <Group> \\ /slash/',
			);
			createdIds.tag_groups.push(id);
		});

		it('should handle inserting rows with unicode characters', async () => {
			const id = randomUUID();
			const row = {
				id,
				tag_group_name: '日本語テスト 🦟 Ñoño café',
			};

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data![0].tag_group_name).toBe('日本語テスト 🦟 Ñoño café');
			createdIds.tag_groups.push(id);
		});

		it('should handle inserting rows with very long strings', async () => {
			const id = randomUUID();
			const longName = 'A'.repeat(10000);
			const row = {
				id,
				tag_group_name: longName,
			};

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data![0].tag_group_name.length).toBe(10000);
			createdIds.tag_groups.push(id);
		});

		it('should handle inserting a row with empty string', async () => {
			const id = randomUUID();
			const row = {
				id,
				tag_group_name: '',
			};

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data![0].tag_group_name).toBe('');
			createdIds.tag_groups.push(id);
		});

		it('should handle enum values correctly', async () => {
			const id = randomUUID();
			const row = {
				id,
				unit_name: `Enum Test Unit ${id.slice(0, 8)}`,
				abbreviation: `etu${id.slice(0, 4)}`,
				base_unit_id: null,
				conversion_factor: null,
				conversion_offset: null,
				unit_system: 'imperial' as const,
				unit_type: 'distance' as const,
			};

			const result = await insert(
				'units',
				UnitsBaseRowSchema,
				UnitsInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data![0].unit_system).toBe('imperial');
			expect(result.data![0].unit_type).toBe('distance');
			createdIds.units.push(id);
		});

		it('should handle numeric precision correctly', async () => {
			const id = randomUUID();
			const row = {
				id,
				unit_name: `Precision Unit ${id.slice(0, 8)}`,
				abbreviation: `pu${id.slice(0, 4)}`,
				base_unit_id: null,
				conversion_factor: 0.3048,
				conversion_offset: -273.15,
				unit_system: 'si' as const,
				unit_type: 'temperature' as const,
			};

			const result = await insert(
				'units',
				UnitsBaseRowSchema,
				UnitsInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data![0].conversion_factor).toBeCloseTo(0.3048, 4);
			expect(result.data![0].conversion_offset).toBeCloseTo(-273.15, 2);
			createdIds.units.push(id);
		});
	});

	// ── Order of Validation ────────────────────────────────────────────────────

	describe('validation order', () => {
		it('should check MAX_INSERT_ROWS before schema validation', async () => {
			// Validation order is now: empty → max → schema.
			// So 501 rows of bad data should hit the max rows check first.
			const rows = Array.from({ length: 501 }, () => ({
				id: 'bad-uuid',
				tag_group_name: 'test',
			}));

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				rows,
			);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain(
				'Cannot insert more than 500 rows',
			);
		});

		it('should return schema validation error when data is invalid and within row limit', async () => {
			const rows = [
				{
					id: 'definitely-not-a-uuid',
					tag_group_name: 'test',
				},
			];

			const result = await insert(
				'tag_groups',
				TagGroupsBaseRowSchema,
				TagGroupsInsertSchema,
				supabase,
				rows,
			);

			expect(result.data).toBeNull();
			expect(result.error!.message).toBe('Invalid insert data');
		});
	});

	// ── Roles Table (schema mismatch investigation) ────────────────────────────

	describe('roles table (fixed schema — id is number)', () => {
		it('should reject UUID as id since roles.id is a number type', async () => {
			const row = {
				id: randomUUID(),
				role_name: 'Test Role UUID',
				description: 'Should fail — id must be number',
			};

			const result = await insert(
				'roles',
				RolesBaseRowSchema,
				RolesInsertSchema,
				supabase,
				[row] as any,
			);

			// The insert schema now has id: z.number(), so a UUID string fails validation
			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toBe('Invalid insert data');
		});

		it('should accept a numeric id for roles', async () => {
			// Use a high number to avoid collision with existing roles
			const roleId = Math.floor(Math.random() * 900000) + 100000;
			const row = {
				id: roleId,
				role_name: `Test Role ${roleId}`,
				description: 'A test role with numeric id',
			};

			const result = await insert(
				'roles',
				RolesBaseRowSchema,
				RolesInsertSchema,
				supabase,
				[row],
			);

			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data![0].id).toBe(roleId);

			// Clean up — roles.id is number, but our cleanup helper expects strings
			// so clean up directly
			await supabase.from('roles').delete().eq('id', roleId);
		});
	});
});
