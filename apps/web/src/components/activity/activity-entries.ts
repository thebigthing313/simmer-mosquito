/**
 * The seventeen activity branches, over synced rows.
 *
 * `useDayActivity` loads one day of the Organization's records off Electric
 * and hands each row here, and this answers which entries the row is: whose
 * field work, in what role, dated by which column. Nine record kinds, eleven
 * primary roles, six assisting ones through `additional_personnel`. The rules
 * are the Activity Monitor's, which used to be `activityBranches` on the
 * server; this is now the one copy.
 *
 * Attribution is field attribution: the record's own domain column
 * (`inspected_by_profile_id`, `applicator_profile_id`, and so on) or an
 * assisting link, never `created_by_profile_id`, because whoever typed a
 * record in the evening was not at its coordinates. Habitats and traps are
 * the exception: they carry no domain column, so creation is the only signal,
 * and their pins mean "created this site record". A record with no attributed
 * Profile is nobody's entry and produces none.
 *
 * Every timestamp is read in the Organization's zone, so a trap set at 9pm
 * files under the day the crew worked rather than the day UTC rolled over.
 * The `detail`, `stages` and `label` tokens are the ones the server used to
 * send, unchanged, so `activityBadgeFacts` and the log read them as before.
 */

import type {
	ActivityCategory,
	ActivityFamily,
	ActivityInvolvement,
	ActivityRole,
} from '@simmer-mosquito/domain';
import type {
	AdultCollection,
	Application,
	BiocontrolAction,
	Habitat,
	Inspection,
	OutreachAction,
	ServiceRequest,
	SourceReduction,
	Trap,
} from '@simmer-mosquito/sync';
import { adhocLabel } from '../../lib/coordinate-label';
import { localCalendarDay } from '../../lib/local-date';
import type { ActivityEntry } from './activity-data';

/** One entry with the two columns a day-wide read carries and a one-Profile log does not. */
export interface DayActivityEntry extends ActivityEntry {
	/** The Profile this entry is attributed to. */
	readonly profileId: string;
	/**
	 * The moment this entry is best known by, as an ISO instant: `occurredAt`
	 * where the record carries one, else when the record was typed in. Never
	 * null, which is what lets "the latest record" be answered for a person
	 * whose day was inspections, a kind that carries a date and no time.
	 */
	readonly recordedAt: string;
}

/** The people who assisted on a record, as `useDayActivity` includes them. */
export interface AssistingLink {
	readonly profileId: string;
}

/** The day and zone every branch dates against. */
export interface DayScope {
	/** `YYYY-MM-DD` in the Organization's zone. */
	readonly day: string;
	readonly timeZone: string;
}

/** A row's place, as the two left joins the place-bearing kinds carry resolve it. */
interface PlaceNames {
	readonly habitatName: string | null | undefined;
	readonly addressName: string | null | undefined;
}

type Row<T, K extends keyof T> = Pick<T, K>;

// --- the record half ----------------------------------------------------------

interface RecordHalf {
	readonly category: ActivityCategory;
	readonly family: ActivityFamily;
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly label?: string | null;
	readonly placeName?: string | null;
	readonly refId?: string | null;
	readonly methodRefId?: string | null;
	readonly amount?: number | null;
	readonly unitId?: string | null;
	readonly detail?: string | null;
	readonly stages?: string | null;
	readonly context?: string | null;
	readonly hasBycatch?: boolean | null;
	readonly tagIds?: readonly string[] | null;
}

interface Moment {
	readonly date: string;
	readonly occurredAt: Date | null;
	/** When the record was typed in, the fallback for `recordedAt`. */
	readonly createdAt: Date;
}

/** Every optional column of the record half, absent: a kind spells only the ones it has. */
const NO_RECORD_COLUMNS = {
	label: null,
	placeName: null,
	refId: null,
	methodRefId: null,
	amount: null,
	unitId: null,
	detail: null,
	stages: null,
	context: null,
	hasBycatch: null,
	tagIds: null,
} as const satisfies Omit<RecordHalf, 'category' | 'family' | 'id' | 'lat' | 'lng'>;

function entry(
	record: RecordHalf,
	moment: Moment,
	who: {
		readonly profileId: string;
		readonly role: ActivityRole;
		readonly involvement: ActivityInvolvement;
	},
): DayActivityEntry {
	return {
		...NO_RECORD_COLUMNS,
		...record,
		involvement: who.involvement,
		role: who.role,
		date: moment.date,
		occurredAt: moment.occurredAt === null ? null : moment.occurredAt.toISOString(),
		profileId: who.profileId,
		recordedAt: (moment.occurredAt ?? moment.createdAt).toISOString(),
	};
}

/** The primary entry, if the record attributes one, then one per assisting link. */
function attributed(
	record: RecordHalf,
	moment: Moment,
	primary: { readonly profileId: string | null; readonly role: ActivityRole },
	assisting: readonly AssistingLink[],
): DayActivityEntry[] {
	const entries: DayActivityEntry[] = [];
	if (primary.profileId !== null) {
		entries.push(
			entry(record, moment, {
				profileId: primary.profileId,
				role: primary.role,
				involvement: 'primary',
			}),
		);
	}
	for (const link of assisting) {
		entries.push(
			entry(record, moment, {
				profileId: link.profileId,
				role: 'assisted',
				involvement: 'assisting',
			}),
		);
	}
	return entries;
}

// --- the display tokens ---------------------------------------------------------

function trimmed(value: string | null | undefined): string | null {
	const text = value?.trim() ?? '';
	return text === '' ? null : text;
}

/** The habitat, else the address, a record was performed at. */
function placeNameOf(place: PlaceNames): string | null {
	return trimmed(place.habitatName) ?? trimmed(place.addressName);
}

/** `Code - Name`, either alone, or null when a trap has neither. */
function trapLabel(trap: { readonly trap_code: string | null; readonly trap_name: string | null }) {
	const parts = [trimmed(trap.trap_code), trimmed(trap.trap_name)].filter(
		(part): part is string => part !== null,
	);
	return parts.length === 0 ? null : parts.join(' - ');
}

/** Inaccessible outranks inactive: a site nobody can get to is the more useful thing to say. */
function habitatStatus(habitat: Row<Habitat, 'is_active' | 'is_inaccessible'>): string {
	if (habitat.is_active === false) {
		return 'inactive';
	}
	return habitat.is_inaccessible === true ? 'inaccessible' : 'active';
}

/**
 * What an inspection found: `dry`, or the density recorded, or `wet` where the
 * site held water but nothing was counted. Dry and "wet with none found" are
 * different statements and must not collapse into one.
 */
function inspectionResult(inspection: Row<Inspection, 'is_wet' | 'density'>): string {
	if (inspection.is_wet === false) {
		return 'dry';
	}
	return inspection.density ?? 'wet';
}

/** The life stages found, as the `E1234P` codes the strip draws; null where none. */
function lifeStageCodes(
	inspection: Row<
		Inspection,
		| 'has_eggs'
		| 'has_first_instar'
		| 'has_second_instar'
		| 'has_third_instar'
		| 'has_fourth_instar'
		| 'has_pupae'
	>,
): string | null {
	const codes = [
		inspection.has_eggs ? 'E' : '',
		inspection.has_first_instar ? '1' : '',
		inspection.has_second_instar ? '2' : '',
		inspection.has_third_instar ? '3' : '',
		inspection.has_fourth_instar ? '4' : '',
		inspection.has_pupae ? 'P' : '',
	].join('');
	return codes === '' ? null : codes;
}

/** All four states, the resolution the explorer paints its dot with. */
function collectionStatus(
	collection: Row<
		AdultCollection,
		'collection_timing_mode' | 'collected_at' | 'has_problem' | 'is_zero_result'
	>,
): string {
	if (
		collection.collection_timing_mode === 'exact_timestamps' &&
		collection.collected_at === null
	) {
		return 'pending';
	}
	if (collection.has_problem) {
		return 'problem';
	}
	return collection.is_zero_result ? 'zero_result' : 'collected';
}

// --- the branches ------------------------------------------------------------------

function onDay(instant: Date | null, scope: DayScope): boolean {
	return instant !== null && localCalendarDay(instant, scope.timeZone) === scope.day;
}

/** A place record: created this site. Dated by creation because it carries no operational date. */
export function habitatEntries(
	habitat: Row<
		Habitat,
		| 'id'
		| 'lat'
		| 'lng'
		| 'habitat_name'
		| 'habitat_type_id'
		| 'is_active'
		| 'is_inaccessible'
		| 'created_by_profile_id'
		| 'created_at'
	> & { readonly tagIds: readonly string[] },
	scope: DayScope,
): DayActivityEntry[] {
	if (!onDay(habitat.created_at, scope)) {
		return [];
	}
	return attributed(
		{
			category: 'habitat',
			family: 'larval',
			id: habitat.id,
			lat: habitat.lat,
			lng: habitat.lng,
			label: habitat.habitat_name,
			refId: habitat.habitat_type_id,
			detail: habitatStatus(habitat),
			tagIds: habitat.tagIds,
		},
		{ date: scope.day, occurredAt: habitat.created_at, createdAt: habitat.created_at },
		{ profileId: habitat.created_by_profile_id, role: 'created' },
		[],
	);
}

export function inspectionEntries(
	inspection: Row<
		Inspection,
		| 'id'
		| 'lat'
		| 'lng'
		| 'inspection_date'
		| 'habitat_type_id'
		| 'inspected_by_profile_id'
		| 'is_wet'
		| 'density'
		| 'has_eggs'
		| 'has_first_instar'
		| 'has_second_instar'
		| 'has_third_instar'
		| 'has_fourth_instar'
		| 'has_pupae'
		| 'created_at'
	> &
		PlaceNames & { readonly assisting: readonly AssistingLink[] },
	scope: DayScope,
): DayActivityEntry[] {
	if (inspection.inspection_date !== scope.day) {
		return [];
	}
	return attributed(
		{
			category: 'inspection',
			family: 'larval',
			id: inspection.id,
			lat: inspection.lat,
			lng: inspection.lng,
			placeName: placeNameOf(inspection),
			refId: inspection.habitat_type_id,
			detail: inspectionResult(inspection),
			stages: lifeStageCodes(inspection),
		},
		{ date: scope.day, occurredAt: null, createdAt: inspection.created_at },
		{ profileId: inspection.inspected_by_profile_id, role: 'inspected' },
		inspection.assisting,
	);
}

/** A place record, like a habitat: created this trap. */
export function trapEntries(
	trap: Row<
		Trap,
		| 'id'
		| 'lat'
		| 'lng'
		| 'trap_code'
		| 'trap_name'
		| 'collection_method_id'
		| 'is_active'
		| 'created_by_profile_id'
		| 'created_at'
	>,
	scope: DayScope,
): DayActivityEntry[] {
	if (!onDay(trap.created_at, scope)) {
		return [];
	}
	return attributed(
		{
			category: 'trap',
			family: 'adult',
			id: trap.id,
			lat: trap.lat,
			lng: trap.lng,
			label: trapLabel(trap),
			refId: trap.collection_method_id,
			detail: trap.is_active === false ? 'inactive' : 'active',
		},
		{ date: scope.day, occurredAt: trap.created_at, createdAt: trap.created_at },
		{ profileId: trap.created_by_profile_id, role: 'created' },
		[],
	);
}

/**
 * A collection records two moments in one row, potentially days apart and by
 * different people: the set and the collect. Each is its own entry on its own
 * day. Under exact timestamps a trap still out has no collect visit yet, so
 * the collected entry needs `collected_at` or a `collection_date`; under
 * date-plus-duration the collection date is both visits. An assisting link
 * counts on the collection's effective date: the collect, else the date, else
 * the set.
 */
export function collectionEntries(
	collection: Row<
		AdultCollection,
		| 'id'
		| 'lat'
		| 'lng'
		| 'trap_id'
		| 'collection_method_id'
		| 'collected_at'
		| 'collected_by_profile_id'
		| 'started_at'
		| 'set_by_profile_id'
		| 'collection_timing_mode'
		| 'collection_date'
		| 'has_problem'
		| 'is_zero_result'
		| 'has_bycatch'
		| 'created_at'
	> & {
		readonly trapCode: string | null | undefined;
		readonly trapName: string | null | undefined;
		readonly addressName: string | null | undefined;
		readonly assisting: readonly AssistingLink[];
	},
	scope: DayScope,
): DayActivityEntry[] {
	const record: RecordHalf = {
		category: 'collection',
		family: 'adult',
		id: collection.id,
		lat: collection.lat,
		lng: collection.lng,
		// The trap, then the address, then the coordinates. A collection recorded
		// away from a trap used to hand over nothing here, and the row drew the
		// words "Ad-hoc collection" while the place it was taken sat one join away
		// (#1231). The trap rung keeps `trapLabel` rather than `collectionLabel`'s,
		// because this seam joins the trap and never reads its id.
		placeName:
			trapLabel({
				trap_code: collection.trapCode ?? null,
				trap_name: collection.trapName ?? null,
			}) ??
			trimmed(collection.addressName ?? null) ??
			adhocLabel(collection.lat, collection.lng, 'One-off collection'),
		refId: collection.collection_method_id,
		detail: collectionStatus(collection),
		hasBycatch: collection.has_bycatch,
	};
	const dayOf = (instant: Date | null) =>
		instant === null ? null : localCalendarDay(instant, scope.timeZone);
	const setDate = dayOf(collection.started_at) ?? collection.collection_date;
	const collectedDate = dayOf(collection.collected_at) ?? collection.collection_date;
	const effectiveDate = collectedDate ?? dayOf(collection.started_at);

	const entries: DayActivityEntry[] = [];
	if (collection.set_by_profile_id !== null && setDate === scope.day) {
		entries.push(
			entry(
				record,
				{ date: scope.day, occurredAt: collection.started_at, createdAt: collection.created_at },
				{ profileId: collection.set_by_profile_id, role: 'set', involvement: 'primary' },
			),
		);
	}
	if (collection.collected_by_profile_id !== null && collectedDate === scope.day) {
		entries.push(
			entry(
				record,
				{ date: scope.day, occurredAt: collection.collected_at, createdAt: collection.created_at },
				{
					profileId: collection.collected_by_profile_id,
					role: 'collected',
					involvement: 'primary',
				},
			),
		);
	}
	if (effectiveDate === scope.day) {
		for (const link of collection.assisting) {
			entries.push(
				entry(
					record,
					{
						date: scope.day,
						occurredAt: collection.collected_at ?? collection.started_at,
						createdAt: collection.created_at,
					},
					{ profileId: link.profileId, role: 'assisted', involvement: 'assisting' },
				),
			);
		}
	}
	return entries;
}

export function applicationEntries(
	application: Row<
		Application,
		| 'id'
		| 'lat'
		| 'lng'
		| 'application_date'
		| 'insecticide_id'
		| 'application_method_id'
		| 'amount_applied'
		| 'application_unit_id'
		| 'applicator_profile_id'
		| 'created_at'
	> &
		PlaceNames & { readonly assisting: readonly AssistingLink[] },
	scope: DayScope,
): DayActivityEntry[] {
	if (application.application_date !== scope.day) {
		return [];
	}
	return attributed(
		{
			category: 'application',
			family: 'control',
			id: application.id,
			lat: application.lat,
			lng: application.lng,
			placeName: placeNameOf(application),
			refId: application.insecticide_id,
			methodRefId: application.application_method_id,
			amount: application.amount_applied,
			unitId: application.application_unit_id,
		},
		{ date: scope.day, occurredAt: null, createdAt: application.created_at },
		{ profileId: application.applicator_profile_id, role: 'applied' },
		application.assisting,
	);
}

export function sourceReductionEntries(
	reduction: Row<
		SourceReduction,
		| 'id'
		| 'lat'
		| 'lng'
		| 'source_reduction_date'
		| 'source_reduction_method_id'
		| 'sources_eliminated_amount'
		| 'sources_eliminated_unit_id'
		| 'technician_profile_id'
		| 'created_at'
	> &
		PlaceNames & { readonly assisting: readonly AssistingLink[] },
	scope: DayScope,
): DayActivityEntry[] {
	if (reduction.source_reduction_date !== scope.day) {
		return [];
	}
	return attributed(
		{
			category: 'sourceReduction',
			family: 'control',
			id: reduction.id,
			lat: reduction.lat,
			lng: reduction.lng,
			placeName: placeNameOf(reduction),
			refId: reduction.source_reduction_method_id,
			amount: reduction.sources_eliminated_amount,
			unitId: reduction.sources_eliminated_unit_id,
		},
		{ date: scope.day, occurredAt: null, createdAt: reduction.created_at },
		{ profileId: reduction.technician_profile_id, role: 'reduced' },
		reduction.assisting,
	);
}

export function biocontrolEntries(
	release: Row<
		BiocontrolAction,
		| 'id'
		| 'lat'
		| 'lng'
		| 'biocontrol_date'
		| 'biocontrol_method_id'
		| 'amount_released'
		| 'release_unit_id'
		| 'habitat_id'
		| 'inspection_id'
		| 'technician_profile_id'
		| 'created_at'
	> &
		PlaceNames & { readonly assisting: readonly AssistingLink[] },
	scope: DayScope,
): DayActivityEntry[] {
	if (release.biocontrol_date !== scope.day) {
		return [];
	}
	return attributed(
		{
			category: 'biocontrol',
			family: 'control',
			id: release.id,
			lat: release.lat,
			lng: release.lng,
			placeName: placeNameOf(release),
			refId: release.biocontrol_method_id,
			amount: release.amount_released,
			unitId: release.release_unit_id,
			// The same two arms `controlContext` reads; biocontrol names no collection.
			context:
				release.habitat_id !== null || release.inspection_id !== null ? 'larval' : 'standalone',
		},
		{ date: scope.day, occurredAt: null, createdAt: release.created_at },
		{ profileId: release.technician_profile_id, role: 'released' },
		release.assisting,
	);
}

export function outreachEntries(
	outreach: Row<
		OutreachAction,
		| 'id'
		| 'lat'
		| 'lng'
		| 'outreach_date'
		| 'outreach_method_id'
		| 'reach'
		| 'reach_description'
		| 'technician_profile_id'
		| 'created_at'
	> & {
		readonly addressName: string | null | undefined;
		readonly assisting: readonly AssistingLink[];
	},
	scope: DayScope,
): DayActivityEntry[] {
	if (outreach.outreach_date !== scope.day) {
		return [];
	}
	return attributed(
		{
			category: 'outreach',
			family: 'publicEngagement',
			id: outreach.id,
			lat: outreach.lat,
			lng: outreach.lng,
			placeName: trimmed(outreach.addressName),
			refId: outreach.outreach_method_id,
			// Reach is a count of people, not a measured quantity, so it carries no unit.
			amount: outreach.reach,
			detail: trimmed(outreach.reach_description),
		},
		{ date: scope.day, occurredAt: null, createdAt: outreach.created_at },
		{ profileId: outreach.technician_profile_id, role: 'engaged' },
		outreach.assisting,
	);
}

/**
 * A request is two moments too: received on its request date by one person,
 * closed at an instant by possibly another. Nobody assists on a request.
 */
export function serviceRequestEntries(
	request: Row<
		ServiceRequest,
		| 'id'
		| 'lat'
		| 'lng'
		| 'display_name'
		| 'request_date'
		| 'received_by_profile_id'
		| 'closed_at'
		| 'closed_by_profile_id'
		| 'created_at'
	> & { readonly addressName: string | null | undefined; readonly tagIds: readonly string[] },
	scope: DayScope,
): DayActivityEntry[] {
	const record: RecordHalf = {
		category: 'serviceRequest',
		family: 'publicEngagement',
		id: request.id,
		lat: request.lat,
		lng: request.lng,
		label: request.display_name === null ? null : `Request ${request.display_name}`,
		placeName: trimmed(request.addressName),
		detail: request.closed_at === null ? 'open' : 'closed',
		tagIds: request.tagIds,
	};
	const entries: DayActivityEntry[] = [];
	if (request.received_by_profile_id !== null && request.request_date === scope.day) {
		entries.push(
			entry(
				record,
				{ date: scope.day, occurredAt: null, createdAt: request.created_at },
				{ profileId: request.received_by_profile_id, role: 'received', involvement: 'primary' },
			),
		);
	}
	if (request.closed_by_profile_id !== null && onDay(request.closed_at, scope)) {
		entries.push(
			entry(
				record,
				{ date: scope.day, occurredAt: request.closed_at, createdAt: request.created_at },
				{ profileId: request.closed_by_profile_id, role: 'closed', involvement: 'primary' },
			),
		);
	}
	return entries;
}
