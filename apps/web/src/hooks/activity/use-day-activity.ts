/**
 * One day of the Organization's field work, off the synced tables: every
 * entry the seventeen activity branches produce for that day, for everyone.
 *
 * Nine `useLiveQuery` subsets, one per record kind, each bounded to the day
 * in the type the kind is dated in: a `date` column by equality, a
 * `timestamptz` by the day's start and the next day's start in the
 * Organization's zone. A kind with two moments in one row, collections and
 * service requests, asks for a row on either. The six kinds a crew member
 * can assist on carry their `additional_personnel` rows as a correlated
 * include, and the two Tag-bearing kinds carry their `tag_items` the same
 * way; the site kinds left-join `habitats` and `addresses` for the place
 * name, and collections join `traps`. The rows go through
 * `components/activity/activity-entries`, which holds the rules.
 *
 * One day for the whole Organization rather than one day for one Profile,
 * because both readers ask for a day: the Dashboard's people table groups
 * this by Profile, and the Activity Monitor filters it to one. Both open the
 * same subsets, so the second costs nothing, and switching people on the
 * Monitor is a filter over rows already here. Takes `day` as `YYYY-MM-DD` in
 * the Organization's zone and the zone itself.
 */

import type { InitialQueryBuilder } from '@tanstack/db';
import { and, eq, gte, lt, or, toArray, useLiveQuery } from '@tanstack/react-db';
import {
	applicationEntries,
	biocontrolEntries,
	collectionEntries,
	type DayActivityEntry,
	type DayScope,
	habitatEntries,
	inspectionEntries,
	outreachEntries,
	serviceRequestEntries,
	sourceReductionEntries,
	trapEntries,
} from '../../components/activity/activity-entries';
import { additional_personnel } from '../../lib/collections/additional_personnel';
import { addresses } from '../../lib/collections/addresses';
import { applications } from '../../lib/collections/applications';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { collections } from '../../lib/collections/collections';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import { service_requests } from '../../lib/collections/service_requests';
import { source_reductions } from '../../lib/collections/source_reductions';
import { tag_items } from '../../lib/collections/tag_items';
import { traps } from '../../lib/collections/traps';
import { addCalendarDays, localDayStartAsInstant } from '../../lib/local-date';
import { activityGcTimeMs } from '../queries/shared';

export interface DayActivityRead {
	readonly entries: readonly DayActivityEntry[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

/** The `entity_type` values `additional_personnel` and `tag_items` store, snake_case. */
const ENTITY = {
	habitat: 'habitat',
	inspection: 'inspection',
	collection: 'collection',
	application: 'application',
	sourceReduction: 'source_reduction',
	biocontrol: 'biocontrol_action',
	outreach: 'outreach_action',
	serviceRequest: 'service_request',
} as const;

export function useDayActivity(day: string, timeZone: string): DayActivityRead {
	const scope: DayScope = { day, timeZone };
	const start = localDayStartAsInstant(day, timeZone);
	const next = localDayStartAsInstant(addCalendarDays(day, 1), timeZone);

	const habitatRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: habitats() })
				.where(({ r }) => and(gte(r.created_at, start), lt(r.created_at, next)))
				.select(({ r }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					habitat_name: r.habitat_name,
					habitat_type_id: r.habitat_type_id,
					is_active: r.is_active,
					is_inaccessible: r.is_inaccessible,
					created_by_profile_id: r.created_by_profile_id,
					created_at: r.created_at,
					tags: toArray(
						query
							.from({ ti: tag_items() })
							.where(({ ti }) => and(eq(ti.entity_id, r.id), eq(ti.entity_type, ENTITY.habitat)))
							.select(({ ti }) => ({ tagId: ti.tag_id })),
					),
				})),
	});

	const inspectionRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: inspections() })
				.where(({ r }) => eq(r.inspection_date, day))
				.join({ h: habitats() }, ({ r, h }) => eq(r.habitat_id, h.id), 'left')
				.join({ ad: addresses() }, ({ r, ad }) => eq(r.address_id, ad.id), 'left')
				.select(({ r, h, ad }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					inspection_date: r.inspection_date,
					habitat_type_id: r.habitat_type_id,
					inspected_by_profile_id: r.inspected_by_profile_id,
					is_wet: r.is_wet,
					density: r.density,
					has_eggs: r.has_eggs,
					has_first_instar: r.has_first_instar,
					has_second_instar: r.has_second_instar,
					has_third_instar: r.has_third_instar,
					has_fourth_instar: r.has_fourth_instar,
					has_pupae: r.has_pupae,
					created_at: r.created_at,
					habitatName: h.habitat_name,
					addressName: ad.display_name,
					assisting: assistingOn(query, r.id, ENTITY.inspection),
				})),
	});

	const trapRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: traps() })
				.where(({ r }) => and(gte(r.created_at, start), lt(r.created_at, next)))
				.select(({ r }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					trap_code: r.trap_code,
					trap_name: r.trap_name,
					collection_method_id: r.collection_method_id,
					is_active: r.is_active,
					created_by_profile_id: r.created_by_profile_id,
					created_at: r.created_at,
				})),
	});

	const collectionRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: collections() })
				.where(({ r }) =>
					or(
						and(gte(r.collected_at, start), lt(r.collected_at, next)),
						and(gte(r.started_at, start), lt(r.started_at, next)),
						eq(r.collection_date, day),
					),
				)
				.join({ t: traps() }, ({ r, t }) => eq(r.trap_id, t.id), 'left')
				.select(({ r, t }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					collection_method_id: r.collection_method_id,
					collected_at: r.collected_at,
					collected_by_profile_id: r.collected_by_profile_id,
					started_at: r.started_at,
					set_by_profile_id: r.set_by_profile_id,
					collection_timing_mode: r.collection_timing_mode,
					collection_date: r.collection_date,
					has_problem: r.has_problem,
					is_zero_result: r.is_zero_result,
					has_bycatch: r.has_bycatch,
					created_at: r.created_at,
					trapCode: t.trap_code,
					trapName: t.trap_name,
					assisting: assistingOn(query, r.id, ENTITY.collection),
				})),
	});

	const applicationRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: applications() })
				.where(({ r }) => eq(r.application_date, day))
				.join({ h: habitats() }, ({ r, h }) => eq(r.habitat_id, h.id), 'left')
				.join({ ad: addresses() }, ({ r, ad }) => eq(r.address_id, ad.id), 'left')
				.select(({ r, h, ad }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					application_date: r.application_date,
					insecticide_id: r.insecticide_id,
					application_method_id: r.application_method_id,
					amount_applied: r.amount_applied,
					application_unit_id: r.application_unit_id,
					applicator_profile_id: r.applicator_profile_id,
					created_at: r.created_at,
					habitatName: h.habitat_name,
					addressName: ad.display_name,
					assisting: assistingOn(query, r.id, ENTITY.application),
				})),
	});

	const sourceReductionRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: source_reductions() })
				.where(({ r }) => eq(r.source_reduction_date, day))
				.join({ h: habitats() }, ({ r, h }) => eq(r.habitat_id, h.id), 'left')
				.join({ ad: addresses() }, ({ r, ad }) => eq(r.address_id, ad.id), 'left')
				.select(({ r, h, ad }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					source_reduction_date: r.source_reduction_date,
					source_reduction_method_id: r.source_reduction_method_id,
					sources_eliminated_amount: r.sources_eliminated_amount,
					sources_eliminated_unit_id: r.sources_eliminated_unit_id,
					technician_profile_id: r.technician_profile_id,
					created_at: r.created_at,
					habitatName: h.habitat_name,
					addressName: ad.display_name,
					assisting: assistingOn(query, r.id, ENTITY.sourceReduction),
				})),
	});

	const biocontrolRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: biocontrol_actions() })
				.where(({ r }) => eq(r.biocontrol_date, day))
				.join({ h: habitats() }, ({ r, h }) => eq(r.habitat_id, h.id), 'left')
				.join({ ad: addresses() }, ({ r, ad }) => eq(r.address_id, ad.id), 'left')
				.select(({ r, h, ad }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					biocontrol_date: r.biocontrol_date,
					biocontrol_method_id: r.biocontrol_method_id,
					amount_released: r.amount_released,
					release_unit_id: r.release_unit_id,
					habitat_id: r.habitat_id,
					inspection_id: r.inspection_id,
					technician_profile_id: r.technician_profile_id,
					created_at: r.created_at,
					habitatName: h.habitat_name,
					addressName: ad.display_name,
					assisting: assistingOn(query, r.id, ENTITY.biocontrol),
				})),
	});

	const outreachRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: outreach_actions() })
				.where(({ r }) => eq(r.outreach_date, day))
				.join({ ad: addresses() }, ({ r, ad }) => eq(r.address_id, ad.id), 'left')
				.select(({ r, ad }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					outreach_date: r.outreach_date,
					outreach_method_id: r.outreach_method_id,
					reach: r.reach,
					reach_description: r.reach_description,
					technician_profile_id: r.technician_profile_id,
					created_at: r.created_at,
					addressName: ad.display_name,
					assisting: assistingOn(query, r.id, ENTITY.outreach),
				})),
	});

	const serviceRequestRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ r: service_requests() })
				.where(({ r }) =>
					or(eq(r.request_date, day), and(gte(r.closed_at, start), lt(r.closed_at, next))),
				)
				.join({ ad: addresses() }, ({ r, ad }) => eq(r.address_id, ad.id), 'left')
				.select(({ r, ad }) => ({
					id: r.id,
					lat: r.lat,
					lng: r.lng,
					display_name: r.display_name,
					request_date: r.request_date,
					received_by_profile_id: r.received_by_profile_id,
					closed_at: r.closed_at,
					closed_by_profile_id: r.closed_by_profile_id,
					created_at: r.created_at,
					addressName: ad.display_name,
					tags: toArray(
						query
							.from({ ti: tag_items() })
							.where(({ ti }) =>
								and(eq(ti.entity_id, r.id), eq(ti.entity_type, ENTITY.serviceRequest)),
							)
							.select(({ ti }) => ({ tagId: ti.tag_id })),
					),
				})),
	});

	const reads = [
		habitatRows,
		inspectionRows,
		trapRows,
		collectionRows,
		applicationRows,
		sourceReductionRows,
		biocontrolRows,
		outreachRows,
		serviceRequestRows,
	];

	// One `flatMap` per kind rather than one loop, so each kind's rule is a call
	// and this stays a list of nine reads and nine hand-offs.
	const entries: readonly DayActivityEntry[] = [
		...habitatRows.data.flatMap((row) =>
			habitatEntries({ ...row, tagIds: tagIds(row.tags) }, scope),
		),
		...inspectionRows.data.flatMap((row) =>
			inspectionEntries({ ...row, assisting: links(row.assisting) }, scope),
		),
		...trapRows.data.flatMap((row) => trapEntries(row, scope)),
		...collectionRows.data.flatMap((row) =>
			collectionEntries({ ...row, assisting: links(row.assisting) }, scope),
		),
		...applicationRows.data.flatMap((row) =>
			applicationEntries({ ...row, assisting: links(row.assisting) }, scope),
		),
		...sourceReductionRows.data.flatMap((row) =>
			sourceReductionEntries({ ...row, assisting: links(row.assisting) }, scope),
		),
		...biocontrolRows.data.flatMap((row) =>
			biocontrolEntries({ ...row, assisting: links(row.assisting) }, scope),
		),
		...outreachRows.data.flatMap((row) =>
			outreachEntries({ ...row, assisting: links(row.assisting) }, scope),
		),
		...serviceRequestRows.data.flatMap((row) =>
			serviceRequestEntries({ ...row, tagIds: tagIds(row.tags) }, scope),
		),
	];

	return {
		entries,
		isReady: reads.every((read) => read.isReady),
		isError: reads.some((read) => read.isError),
	};
}

/**
 * The crew members linked to one record, as the include projects them.
 *
 * `recordId` is the outer row's `r.id` ref. The builder's leaf type is not
 * exported, so it arrives as `unknown` and is handed to `eq` as the string
 * the ref stands for; the builder reads the ref at runtime either way.
 */
function assistingOn(query: InitialQueryBuilder, recordId: unknown, entityType: string) {
	return toArray(
		query
			.from({ ap: additional_personnel() })
			.where(({ ap }) => and(eq(ap.entity_id, recordId as string), eq(ap.entity_type, entityType)))
			.select(({ ap }) => ({ profileId: ap.personnel_profile_id })),
	);
}

/**
 * The include arrives typed by the query builder's own aggregate; the two
 * readers below narrow it to the one column each projected.
 */
function links(included: unknown): readonly { readonly profileId: string }[] {
	return included as readonly { readonly profileId: string }[];
}

function tagIds(included: unknown): readonly string[] {
	return (included as readonly { readonly tagId: string }[]).map((tag) => tag.tagId);
}
