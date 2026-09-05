import { type RawBuilder, sql } from 'kysely';

import type { DbExecutor } from '../index.js';
import { regionMembershipMatch } from './map-region-filter.js';

/**
 * Which regions contain this record.
 *
 * The inverse of the Region multiselect, and the same predicate: ADR 0015 says
 * one rule, so a detail page and a filtered map cannot come to disagree about
 * whether a record is in a district. Membership is computed on read and never
 * stored, because a stored copy would be invalidated by every region edit and
 * every geometry write and would go stale silently.
 *
 * A sibling of `record-deletion.ts`: generic, keyed by record type and id,
 * whitelisted, organization-scoped, and answering `found: false` rather than
 * 404 so the read cannot be used to probe for another organization's ids. Read
 * the two as a pair.
 */

/**
 * The fifteen tables carrying a `geom` column, one per record type the read
 * answers for.
 *
 * `DeletableRecordType` is not reusable here, and not because it is a different
 * naming style. It is thirty-one members and wrong in both directions: it
 * carries samples, routes, assignments, contacts, missions and every catalog,
 * none of which have geometry, and it misses mission items, notification
 * registrations and weather sources, which do.
 *
 * A coverage test in `apps/server` holds this list to the set of tables carrying
 * `geom`, read from the generated row schemas rather than from a second hand-kept
 * copy. Without it the sixteenth geom table answers "inside no regions" forever
 * and nobody notices, because it looks like data.
 */
export const REGION_MEMBERSHIP_RECORD_TYPES = [
	'addresses',
	'regions',
	'traps',
	'collections',
	'habitats',
	'inspections',
	'applications',
	'source_reductions',
	'outreach_actions',
	'biocontrol_actions',
	'requested_control_actions',
	'mission_items',
	'service_requests',
	'notification_registrations',
	'weather_sources',
] as const;

export type RegionMembershipRecordType = (typeof REGION_MEMBERSHIP_RECORD_TYPES)[number];

const RECORD_TYPES: ReadonlySet<string> = new Set(REGION_MEMBERSHIP_RECORD_TYPES);

export function isRegionMembershipRecordType(value: string): value is RegionMembershipRecordType {
	return RECORD_TYPES.has(value);
}

export interface RecordRegion {
	readonly id: string;
	readonly name: string;
}

export interface RecordRegionGroup {
	/**
	 * Null with `folderName` for the unfiled group. The id ships so the panel keys
	 * on it rather than on a folder name, which is not unique.
	 */
	readonly folderId: string | null;
	readonly folderName: string | null;
	readonly regions: readonly RecordRegion[];
}

export interface RecordRegions {
	readonly recordType: RegionMembershipRecordType;
	readonly recordId: string;
	/** False when the record is missing, another organization's, or already deleted. */
	readonly found: boolean;
	/**
	 * Folders holding a match, by name, with the unfiled group last. Only folders
	 * with a hit appear, and an empty list on `found: true` is a real answer: a
	 * trap in no spray zone is an operational fact, not a gap.
	 */
	readonly groups: readonly RecordRegionGroup[];
}

/**
 * The only one of the fifteen whose `organization_id` is nullable.
 *
 * The null rows are the shared provider stations `gis/weather/$id.tsx` already
 * branches on, owned by nobody rather than by another organization and visible
 * to every organization by design. So the record gate widens for it and the
 * region side does not: `regions.organization_id` is NOT NULL and the region
 * set scopes to the caller either way, so a shared station is answered with the
 * caller's own regions. That is the point of the read for one, since an
 * organization subscribes to a provider station to find out which of their
 * districts it sits in.
 */
const NULLABLE_TENANCY_TABLES: ReadonlySet<string> = new Set(['weather_sources']);

export async function readRecordRegions(
	db: DbExecutor,
	input: {
		readonly recordType: RegionMembershipRecordType;
		readonly recordId: string;
		readonly organizationId: string;
	},
): Promise<RecordRegions> {
	const empty = {
		recordType: input.recordType,
		recordId: input.recordId,
		groups: [],
	} as const;

	if (!(await recordExists(db, input))) {
		return { ...empty, found: false };
	}

	return { ...empty, found: true, groups: await readGroups(db, input) };
}

async function recordExists(
	db: DbExecutor,
	input: {
		readonly recordType: RegionMembershipRecordType;
		readonly recordId: string;
		readonly organizationId: string;
	},
): Promise<boolean> {
	const result = await sql<{ readonly id: string }>`
		select id from ${sql.table(input.recordType)}
		where id = ${input.recordId}
			and deleted_at is null
			and ${tenancyGate(input.recordType, sql`organization_id`, input.organizationId)}
		limit 1
	`.execute(db);
	return result.rows.length > 0;
}

function tenancyGate(
	recordType: RegionMembershipRecordType,
	column: RawBuilder<unknown>,
	organizationId: string,
) {
	if (NULLABLE_TENANCY_TABLES.has(recordType)) {
		return sql`(${column} = ${organizationId} or ${column} is null)`;
	}
	return sql`${column} = ${organizationId}`;
}

interface RegionRow {
	readonly region_id: string;
	readonly region_name: string;
	readonly folder_id: string | null;
	readonly folder_name: string | null;
}

async function readGroups(
	db: DbExecutor,
	input: {
		readonly recordType: RegionMembershipRecordType;
		readonly recordId: string;
		readonly organizationId: string;
	},
): Promise<readonly RecordRegionGroup[]> {
	// A region is never inside itself. That is an id filter and not a geometry
	// one: two regions can carry identical boundaries and `ST_Relate` matches
	// them, correctly.
	const selfExclusion =
		input.recordType === 'regions' ? sql`and rf.id is distinct from rec.id` : sql``;

	// Deleting a folder soft-deletes the folder and leaves `region_folder_id`
	// pointing at it, so a live region can name a dead folder. The join drops the
	// name and the region falls into the unfiled group, which is what the rest of
	// the app already shows: `region_folders` syncs with soft-deleted rows filtered
	// upstream, so `use-region.ts` left-joins the same miss to a null folder name.
	const result = await sql<RegionRow>`
		select
			rf.id as region_id,
			rf.name as region_name,
			folder.id as folder_id,
			folder.name as folder_name
		from ${sql.table(input.recordType)} rec
		join regions rf
			on rf.organization_id = ${input.organizationId}
			and rf.deleted_at is null
			and rf.geom && rec.geom
			and ${regionMembershipMatch({
				geom: sql`rec.geom`,
				geomType: sql`rec.geom_type`,
				regionGeom: sql`rf.geom`,
			})}
			${selfExclusion}
		left join region_folders folder
			on folder.id = rf.region_folder_id
			and folder.deleted_at is null
		where rec.id = ${input.recordId}
			and rec.deleted_at is null
			and ${tenancyGate(input.recordType, sql`rec.organization_id`, input.organizationId)}
		order by (folder.id is null), folder.name, rf.name, rf.id
	`.execute(db);

	return groupByFolder(result.rows);
}

function groupByFolder(rows: readonly RegionRow[]): readonly RecordRegionGroup[] {
	const groups: RecordRegionGroup[] = [];
	let current: {
		folderId: string | null;
		folderName: string | null;
		regions: RecordRegion[];
	} | null = null;

	for (const row of rows) {
		if (current === null || current.folderId !== row.folder_id) {
			current = { folderId: row.folder_id, folderName: row.folder_name, regions: [] };
			groups.push(current);
		}
		current.regions.push({ id: row.region_id, name: row.region_name });
	}

	return groups;
}
