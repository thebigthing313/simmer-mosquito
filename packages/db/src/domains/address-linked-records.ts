import {
	type ActivityCategory,
	LINKED_RECORD_FAMILIES,
	LINKED_RECORD_FAMILY_OF,
	type LinkedRecordCategory,
	type LinkedRecordFamily,
} from '@simmer-mosquito/domain';
import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';
import {
	type ActivityRecordRow,
	type PlaceSource,
	type RecordColumnsShape,
	recordColumns,
	recordShapes,
} from './profile-activity.js';
import { assertIanaTimeZone, localDateSql } from './record-display-sql.js';

/**
 * One record that names an Address as its Linked Address: the columns the
 * nearby read answers for the seven activity kinds, read off the same
 * register, plus the few the other three kinds need to be named and linked.
 *
 * Every extra column is null on every kind it does not describe, because a
 * `union all` carries one column list.
 */
export interface LinkedRecordRow extends Omit<ActivityRecordRow, 'category' | 'family'> {
	readonly category: LinkedRecordCategory;
	readonly family: LinkedRecordFamily;
	/**
	 * Which rung `placeName` came from. The card drops a place that came from
	 * this Address, which its heading already names, and keeps a habitat or a
	 * trap that only shares the Address's name.
	 */
	readonly placeSource: PlaceSource | null;
	/** A Requested Control Action's or a Mission's control type. */
	readonly controlType: string | null;
	/** A Notification Registration's contact, which its page hangs off. */
	readonly contactId: string | null;
	readonly contactName: string | null;
	/** A Mission stop's Mission, which its row links to. */
	readonly missionId: string | null;
	readonly missionName: string | null;
	readonly missionScheduledStartAt: string | null;
	/**
	 * The record that closed a done Mission stop (ADR 0012): the newest action
	 * that names the stop. Null on an open or skipped stop, and on a done stop
	 * that was marked done by hand with nothing recorded against it.
	 */
	readonly closedByCategory: ActivityCategory | null;
	readonly closedById: string | null;
	/** The closing record's kind lookup, an insecticide or a method. */
	readonly closedByRefId: string | null;
}

/** One family's newest rows and how many there are in all. */
export interface LinkedRecordFamilyPage {
	readonly family: LinkedRecordFamily;
	readonly total: number;
	readonly items: readonly LinkedRecordRow[];
}

export interface AddressLinkedRecordsInput {
	readonly organizationId: string;
	readonly addressId: string;
	/**
	 * The Organization's IANA timezone, which decides the calendar day an
	 * instant-dated record falls on, for the date a row shows and the order the
	 * family is listed in.
	 */
	readonly timeZone: string;
	/** How many rows each family answers with, newest first. */
	readonly limitPerFamily?: number;
}

export interface AddressLinkedRecordsResult {
	/** Every family, in tab order, the empty ones included with a zero total. */
	readonly families: readonly LinkedRecordFamilyPage[];
	/** The per-family cap that was applied, so the page never spells the number. */
	readonly limit: number;
}

export const DEFAULT_LINKED_RECORDS_LIMIT = 25;

const NO_TEXT = 'null::text';

/** The extra columns, null for every kind that sets none of them. */
interface LinkedExtras {
	readonly controlType?: string;
	readonly contactId?: string;
	readonly contactName?: string;
	readonly missionId?: string;
	readonly missionName?: string;
	readonly missionScheduledStartAt?: string;
	readonly closedByCategory?: string;
	readonly closedById?: string;
	readonly closedByRefId?: string;
}

interface LinkedShape extends RecordColumnsShape {
	readonly category: LinkedRecordCategory;
	readonly family: LinkedRecordFamily;
	readonly extras?: LinkedExtras;
}

/**
 * The newest action recorded against a stop, which is the record ADR 0012
 * says closed it. The four tables carrying `mission_item_id` are the four
 * actions a Mission can ask for.
 */
const CLOSING_RECORD_JOIN = `left join lateral (
		select closer.category, closer.id, closer.ref_id
		from (
			select 'application'::text as category, a.id::text as id,
				a.insecticide_id::text as ref_id, a.created_at
			from applications a
			where a.mission_item_id = r.id and a.organization_id = r.organization_id
				and a.deleted_at is null
			union all
			select 'sourceReduction'::text, s.id::text, s.source_reduction_method_id::text, s.created_at
			from source_reductions s
			where s.mission_item_id = r.id and s.organization_id = r.organization_id
				and s.deleted_at is null
			union all
			select 'biocontrol'::text, b.id::text, b.biocontrol_method_id::text, b.created_at
			from biocontrol_actions b
			where b.mission_item_id = r.id and b.organization_id = r.organization_id
				and b.deleted_at is null
			union all
			select 'outreach'::text, o.id::text, o.outreach_method_id::text, o.created_at
			from outreach_actions o
			where o.mission_item_id = r.id and o.organization_id = r.organization_id
				and o.deleted_at is null
		) closer
		order by closer.created_at desc, closer.id desc
		limit 1
	) closing on r.completed_at is not null`;

/**
 * The ten shapes, in one Organization's zone. Seven are the activity
 * register's own entries under this vocabulary's category and family, so a
 * linked row and a nearby row for one record carry one set of columns; the
 * three that are not activity are declared here.
 */
function linkedShapes(timeZone: string): readonly LinkedShape[] {
	const activity = recordShapes(timeZone);
	const localDate = (expression: string) => localDateSql(expression, timeZone);
	const reuse = (category: Extract<ActivityCategory, LinkedRecordCategory>): LinkedShape => ({
		...activity[category],
		category,
		family: LINKED_RECORD_FAMILY_OF[category],
	});

	const stopMoment = 'coalesce(r.completed_at, r.skipped_at, m.scheduled_start_at)';

	return [
		reuse('serviceRequest'),
		{
			category: 'notificationRegistration',
			family: 'requests',
			table: 'notification_registrations',
			joins: 'left join contacts co on co.id = r.contact_id',
			date: localDate('r.created_at'),
			occurredAt: 'r.created_at',
			label: `nullif(btrim(co.contact_name), '')`,
			placeName: NO_TEXT,
			placeSource: NO_TEXT,
			refId: NO_TEXT,
			detail: `case when r.is_active then 'active' else 'inactive' end`,
			extras: {
				contactId: 'r.contact_id::text',
				contactName: `nullif(btrim(co.contact_name), '')`,
			},
		},
		reuse('inspection'),
		reuse('collection'),
		reuse('application'),
		reuse('sourceReduction'),
		reuse('biocontrol'),
		reuse('outreach'),
		{
			category: 'requestedControlAction',
			family: 'requestedControlActions',
			table: 'requested_control_actions',
			date: localDate('r.requested_at'),
			occurredAt: 'r.requested_at',
			label: `nullif(btrim(r.summary), '')`,
			placeName: NO_TEXT,
			placeSource: NO_TEXT,
			refId: 'r.recommended_method_id::text',
			detail: `case when r.resolved_at is null then 'open' else 'resolved' end`,
			extras: { controlType: 'r.control_type::text' },
		},
		{
			category: 'missionItem',
			family: 'missionStops',
			table: 'mission_items',
			// The Mission is an inner join: a stop on a deleted Mission has no page
			// to link to, and the stop is gone from every surface that reads it.
			joins: `join missions m on m.id = r.mission_id
				and m.organization_id = r.organization_id
				and m.deleted_at is null
				left join requested_control_actions rca on rca.id = r.requested_control_action_id
				${CLOSING_RECORD_JOIN}`,
			date: localDate(stopMoment),
			occurredAt: stopMoment,
			// What `missionStopName` reads first: the name typed for the stop, then
			// the request it was drawn from. The Address it sits at is this page.
			label: `coalesce(nullif(btrim(r.name), ''), nullif(btrim(rca.summary), ''))`,
			placeName: NO_TEXT,
			placeSource: NO_TEXT,
			refId: NO_TEXT,
			detail: `case when r.completed_at is not null then 'done'
				when r.skipped_at is not null then 'skipped' else 'open' end`,
			extras: {
				controlType: 'm.control_type::text',
				missionId: 'm.id::text',
				missionName: `nullif(btrim(m.mission_name), '')`,
				missionScheduledStartAt: `to_char(m.scheduled_start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
				closedByCategory: 'closing.category',
				closedById: 'closing.id',
				closedByRefId: 'closing.ref_id',
			},
		},
	];
}

/**
 * Every record in the Organization whose `address_id` names the Address, in
 * every status, as one page per family: the newest `limitPerFamily` rows and
 * the family's total. One round-trip; each branch is organization-scoped and
 * soft-delete filtered the way the nearby read's are, and is matched on the
 * column rather than on distance, because a Linked Address is what the record
 * named and not where it is.
 *
 * Newest first is by the row's date, then its moment where it has one, then
 * its id, so a family with two records on one day lists in one order every
 * time.
 */
export async function listAddressLinkedRecords(
	db: Kysely<SimmerDatabase>,
	input: AddressLinkedRecordsInput,
): Promise<AddressLinkedRecordsResult> {
	const limit = input.limitPerFamily ?? DEFAULT_LINKED_RECORDS_LIMIT;
	const shapes = linkedShapes(assertIanaTimeZone(input.timeZone));

	const result = await sql<LinkedRecordRow & { readonly total: number }>`
		with linked as (
			${sql.join(
				shapes.map((shape) => linkedSelect(shape, input)),
				sql` union all `,
			)}
		),
		ranked as (
			select linked as linked_row,
				linked.family,
				count(*) over (partition by linked.family)::int as total,
				row_number() over (
					partition by linked.family
					order by linked.date desc, linked."occurredAt" desc nulls last, linked.id desc
				) as rank
			from linked
		)
		select (ranked.linked_row).*, ranked.total
		from ranked
		where ranked.rank <= ${limit}
		order by ranked.family, ranked.rank
	`.execute(db);

	const byFamily = new Map<LinkedRecordFamily, { total: number; items: LinkedRecordRow[] }>();
	for (const row of result.rows) {
		const { total, ...rest } = row;
		const page = byFamily.get(row.family) ?? { total: Number(total), items: [] };
		page.items.push({
			...rest,
			lat: Number(rest.lat),
			lng: Number(rest.lng),
			// `numeric` arrives as a string over the wire, and a quantity rendered as
			// one formats wrong rather than failing.
			amount: rest.amount === null ? null : Number(rest.amount),
		});
		byFamily.set(row.family, page);
	}

	return {
		families: LINKED_RECORD_FAMILIES.map((family) => ({
			family,
			total: byFamily.get(family)?.total ?? 0,
			items: byFamily.get(family)?.items ?? [],
		})),
		limit,
	};
}

/** One branch of the union: a shape's columns, its extras, and the address predicate. */
function linkedSelect(
	shape: LinkedShape,
	input: AddressLinkedRecordsInput,
): RawBuilder<LinkedRecordRow> {
	const extras = shape.extras ?? {};
	const column = (expression: string | undefined, name: keyof LinkedExtras) =>
		sql`${sql.raw(expression ?? NO_TEXT)}::text as ${sql.ref(name)}`;
	return sql<LinkedRecordRow>`
		select ${recordColumns(shape, { date: shape.date, occurredAt: shape.occurredAt })},
			${sql.raw(shape.placeSource)}::text as "placeSource",
			${sql.join([
				column(extras.controlType, 'controlType'),
				column(extras.contactId, 'contactId'),
				column(extras.contactName, 'contactName'),
				column(extras.missionId, 'missionId'),
				column(extras.missionName, 'missionName'),
				column(extras.missionScheduledStartAt, 'missionScheduledStartAt'),
				column(extras.closedByCategory, 'closedByCategory'),
				column(extras.closedById, 'closedById'),
				column(extras.closedByRefId, 'closedByRefId'),
			])}
		from ${sql.raw(shape.table)} r
		${shape.joins === undefined ? sql`` : sql.raw(shape.joins)}
		where r.organization_id = ${input.organizationId}
			and r.deleted_at is null
			and r.address_id = ${input.addressId}
	`;
}

/** Whether the Address exists in the Organization, which is what scopes the read to it. */
export async function addressExistsInOrganization(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly addressId: string },
): Promise<boolean> {
	const result = await sql<{ readonly id: string }>`
		select a.id from addresses a
		where a.id = ${input.addressId}
			and a.organization_id = ${input.organizationId}
			and a.deleted_at is null
		limit 1
	`.execute(db);
	return result.rows.length > 0;
}
