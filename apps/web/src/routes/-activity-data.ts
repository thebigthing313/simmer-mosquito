import {
	type ActivityCategory,
	type ActivityFamily,
	type ActivityInvolvement,
	isLarvalDensity,
} from '@simmer-mosquito/domain';
import type { LinkProps } from '@tanstack/react-router';
import type { LifeStageFlags } from '../components/larval-display';
import type { CollectionStatus } from '../components/map';
import type { Tag } from '../hooks/queries/tag-view';
import type { InspectionResult, LifecycleStatus, RecordBadgeFacts } from './-record-badges';
import {
	type ControlContext,
	formatAmount,
	insecticideDisplayName,
} from './control-operations/-control-display';

// Data + display helpers for one Profile's field work: the response shape, the
// grouping into families, and the wording the page states around it. Daily Work
// reads one day. The endpoint behind it still answers a `dateFrom`/`dateTo`
// range, so the response carries both ends, and `dailyWorkWindow` is what makes
// them the same day; nothing below groups by date.
// Dash-prefixed so TanStack Router ignores this file as a route.

export interface ActivityEntry {
	readonly category: ActivityCategory;
	readonly family: ActivityFamily;
	readonly involvement: ActivityInvolvement;
	readonly role: string;
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly date: string;
	readonly occurredAt: string | null;
	/** The record's own name where it has one — a habitat, a trap, a request number. */
	readonly label: string | null;
	/** The place it hangs off — habitat, trap or address — already resolved server-side. */
	readonly placeName: string | null;
	/** The lookup that names its kind (type/method/insecticide). */
	readonly refId: string | null;
	/** A second lookup where one exists — an application's method, beside its product. */
	readonly methodRefId: string | null;
	/** What the record measured: applied, eliminated, released, reached. */
	readonly amount: number | null;
	/** The unit `amount` is in; null where the quantity is a bare count. */
	readonly unitId: string | null;
	/** One short, category-specific extra — a density, a status, a reach description. */
	readonly detail: string | null;
	/** The life stages an inspection found, as the `E1234P` codes the strip draws. */
	readonly stages: string | null;
	/** What a control action was performed against: `larval` or `standalone`. */
	readonly context: string | null;
	/** Whether a collection caught something other than what it was set for. */
	readonly hasBycatch: boolean | null;
	/** The Tags on this record, resolved against the eagerly synced catalog. */
	readonly tagIds: readonly string[] | null;
}

/**
 * The record half of an entry: everything but whose entry it is.
 *
 * `involvement` and `role` say what a person did to the record, and only Daily
 * Work has a person to ask about. The nearby list on a service request draws
 * the same seven kinds of record with no person in the question, so the
 * describer, the badge facts and the Tags below read this rather than the
 * whole entry, and one row shape serves both surfaces.
 */
export type ActivityRecord = Omit<ActivityEntry, 'involvement' | 'role'>;

export interface ActivityResponse {
	readonly profileId: string;
	readonly dateFrom: string;
	readonly dateTo: string;
	readonly items: readonly ActivityEntry[];
	readonly total: number;
	/** The row cap bit: the log shown is not the whole log. */
	readonly truncated: boolean;
}

export const ACTIVITY_FAMILY_LABELS: readonly {
	readonly key: ActivityFamily;
	readonly label: string;
}[] = [
	{ key: 'larval', label: 'Larval Surveillance' },
	{ key: 'adult', label: 'Adult Surveillance' },
	{ key: 'control', label: 'Control Actions' },
	{ key: 'publicEngagement', label: 'Public Engagement' },
];

const ACTIVITY_CATEGORY_LABEL: Readonly<Record<ActivityCategory, string>> = {
	habitat: 'Habitat',
	inspection: 'Inspection',
	trap: 'Trap',
	collection: 'Collection',
	application: 'Application',
	sourceReduction: 'Source Reduction',
	biocontrol: 'Biocontrol',
	outreach: 'Outreach',
	serviceRequest: 'Service Request',
};

/**
 * What the person did to the record, in the past tense the list reads in.
 *
 * `created` is the one to read carefully: habitats and traps carry no domain
 * attribution column, so creating the site record is the only signal there is —
 * the pin means "recorded this site", not "stood here".
 */
export const ACTIVITY_ROLE_LABEL: Readonly<Record<string, string>> = {
	created: 'Created',
	inspected: 'Inspected',
	set: 'Set',
	collected: 'Collected',
	applied: 'Applied',
	reduced: 'Reduced',
	released: 'Released',
	engaged: 'Engaged',
	received: 'Received',
	closed: 'Closed',
	assisted: 'Assisted',
};

/**
 * Where each record kind's detail page lives. Every one takes an `$id`.
 *
 * Read through {@link activityRow} by the Daily Work log and by the nearby
 * list on a service request, so the chevron on a row goes to the same page
 * whichever list drew it.
 */
const ACTIVITY_DETAIL_ROUTE = {
	habitat: '/larval-surveillance/habitats/$id',
	inspection: '/larval-surveillance/inspections/$id',
	trap: '/adult-surveillance/traps/$id',
	collection: '/adult-surveillance/collections/$id',
	application: '/control-operations/chemical/$id',
	sourceReduction: '/control-operations/source-reduction/$id',
	biocontrol: '/control-operations/biocontrol/$id',
	outreach: '/public-engagement/outreach/$id',
	serviceRequest: '/public-engagement/service-requests/$id',
} as const satisfies Record<ActivityCategory, string>;

/**
 * The key one entry is selected by.
 *
 * A collection set on Monday and collected on Thursday is two entries sharing
 * one record id, so the id alone cannot say which visit is selected.
 */
export function activityEntryKey(entry: ActivityEntry): string {
	return `${entry.category}:${entry.id}:${entry.role}`;
}

export interface ActivityFamilyGroup {
	readonly family: ActivityFamily;
	readonly entries: readonly ActivityEntry[];
}

/**
 * The log, as families in {@link ACTIVITY_FAMILY_LABELS} order, empty ones left
 * out.
 *
 * Within a family the entries run oldest-first, but only partly: six of the nine
 * categories are dated by a `date` with no time of day, so entries without a
 * timestamp keep the order the server sent and sit after the timed ones.
 *
 * There is no day level. The page sends one day as both ends of the window, so
 * every entry here carries the same `date`, and a heading naming it would repeat
 * the stepper. Handed two days, this would fold them into one set of families
 * with nothing on a row to say which day it fell on, so a page that ever reads a
 * range again owes the grouping a date rather than reaching for this.
 */
export function groupActivityByFamily(
	items: readonly ActivityEntry[],
): readonly ActivityFamilyGroup[] {
	const entries = items.slice().sort(byMoment);
	return ACTIVITY_FAMILY_LABELS.map(({ key }) => ({
		family: key,
		entries: entries.filter((entry) => entry.family === key),
	})).filter((group) => group.entries.length > 0);
}

/** Timed entries first, in order; undated ones keep their incoming order after them. */
function byMoment(first: ActivityEntry, second: ActivityEntry): number {
	if (first.occurredAt === null && second.occurredAt === null) {
		return 0;
	}
	if (first.occurredAt === null) {
		return 1;
	}
	if (second.occurredAt === null) {
		return -1;
	}
	return first.occurredAt.localeCompare(second.occurredAt);
}

/**
 * The pin cloud.
 *
 * `id` is the *entry* key rather than the record id, because that is what the
 * map's click handler hands back and what selection is keyed on; the record id
 * rides along as `recordId` for the card to fetch by.
 */
export function buildActivityMapData(
	items: readonly ActivityEntry[],
): GeoJSON.FeatureCollection | null {
	if (items.length === 0) {
		return null;
	}

	return {
		type: 'FeatureCollection',
		features: items.map((item) => ({
			type: 'Feature',
			properties: {
				id: activityEntryKey(item),
				recordId: item.id,
				category: item.category,
				family: item.family,
				involvement: item.involvement,
			},
			geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
		})),
	};
}

/**
 * One id → name map over every lookup an activity entry can reference, plus the
 * unit formatter its quantity needs.
 *
 * Ids are globally unique, so one map serves every category's `refId` and
 * `methodRefId` alike — the same trick the nearby context view takes. All of
 * these stream eagerly, so this needs no fetch.
 */
export interface ActivityLookups {
	readonly nameById: ReadonlyMap<string, string>;
	readonly formatQuantity: (amount: number, unitId: string | null) => string;
	/**
	 * The Tag catalog, for the two categories that carry Tags. Retired Tags are
	 * in it, because a record tagged in the past still wears the label.
	 */
	readonly tagById: ReadonlyMap<string, Tag>;
}

/**
 * The maps themselves, beside the hook rather than inside it.
 *
 * The rosters are structural rather than the catalog row types, because the six
 * that contribute a name are three different shapes and only `id` and `name` are
 * read off any of them.
 */
export function activityLookups(
	rosters: readonly (readonly { readonly id: string; readonly name: string }[])[],
	insecticides: readonly { readonly id: string; readonly tradeName: string }[],
	units: readonly { readonly id: string; readonly abbreviation: string }[],
	tagById: ReadonlyMap<string, Tag>,
): ActivityLookups {
	const nameById = new Map<string, string>();
	for (const rows of rosters) {
		for (const row of rows) {
			nameById.set(row.id, row.name);
		}
	}
	for (const row of insecticides) {
		nameById.set(row.id, insecticideDisplayName(row));
	}

	const unitById = new Map(units.map((unit) => [unit.id, unit] as const));
	return {
		nameById,
		formatQuantity: (amount: number, unitId: string | null) =>
			formatAmount(amount, unitId === null ? undefined : unitById.get(unitId)),
		tagById,
	};
}

/**
 * The wording a page states around the log.
 *
 * The log, the panel states and the pin cloud are all shared; what a page says
 * about them is a sentence about dates, and that is the only part it owns.
 * Collected here so a page states its wording once rather than having the shared
 * parts guess at the window it chose.
 */
export interface ActivityCopy {
	/** Nothing was recorded. The explorer frame draws this. */
	readonly empty: { readonly title: string; readonly body: string };
	/** The server declined the question. Its own reason is the body. */
	readonly refusalTitle: string;
	/** What to do about a capped log, where there is anything to do. */
	readonly truncationAdvice: string | null;
	/** The read failed for no reason the server gave. What to try, in this page's terms. */
	readonly loadFailureBody: string;
}

/**
 * Which of the three non-log states the panel is in, if any.
 *
 * A pure resolution rather than a chain of early returns in the component,
 * because the distinction that matters here is a product one: an outage must
 * never read as an empty day. The two are indistinguishable on the page unless
 * something says which is which, and one of them is a conclusion about a
 * colleague.
 */
export function activityPanelMessage(
	state: {
		readonly isLoading: boolean;
		readonly error: Error | null;
		readonly isEmpty: boolean;
	},
	copy: ActivityCopy,
): { readonly title: string; readonly body: string } | 'loading' | null {
	// Loading with entries already on screen is not a loading state: the reader
	// changed the day and the previous log stays until the new one lands, rather
	// than the panel blanking under them.
	if (state.isLoading && state.isEmpty) {
		return 'loading';
	}
	// A refusal says which window was refused; anything else is an outage, and an
	// outage must never read as an empty day.
	if (state.error !== null) {
		return isRefusal(state.error)
			? { title: copy.refusalTitle, body: state.error.message }
			: { title: 'Activity could not be loaded', body: copy.loadFailureBody };
	}
	if (state.isEmpty) {
		return copy.empty;
	}
	return null;
}

/**
 * How the panel's non-log states split between the frame and the body.
 *
 * The frame owns the placeholder rows and the empty state on all fifteen
 * explorers, so this hands it those two and keeps the rest. What it keeps names
 * a reason the frame's copy has nowhere to put: a refusal repeating the window
 * the server declined, or an outage that must never read as a quiet day.
 */
export function activityPanelState(
	state: {
		readonly isLoading: boolean;
		readonly error: Error | null;
		readonly isEmpty: boolean;
	},
	copy: ActivityCopy,
): {
	/** The frame draws its empty state, or its placeholder rows if still loading. */
	readonly isEmpty: boolean;
	/** The body draws this instead of the log. */
	readonly message: { readonly title: string; readonly body: string } | null;
	readonly emptyTitle: string;
	readonly emptyDescription: string;
} {
	const message = activityPanelMessage(state, copy);
	const empty = { emptyTitle: copy.empty.title, emptyDescription: copy.empty.body };
	if (message === 'loading' || message === copy.empty) {
		return { isEmpty: true, message: null, ...empty };
	}
	return { isEmpty: false, message, ...empty };
}

/**
 * A refusal the page must repeat rather than swallow: the range was too wide,
 * the dates were malformed. Carries the server's own reason.
 */
export class ActivityRequestError extends Error {
	readonly refused: boolean;

	constructor(message: string, refused: boolean) {
		super(message);
		this.name = 'ActivityRequestError';
		this.refused = refused;
	}
}

/** A refusal is the server declining the question, not the read failing. */
function isRefusal(error: Error): boolean {
	return error instanceof ActivityRequestError && error.refused;
}

/**
 * One entry, as the shared badge register reads a record.
 *
 * The server sends short tokens rather than a column per kind, so this is where
 * they become the facts the badge register switches on. It is a pure
 * resolution rather than a chain of conditions inside the row, because the
 * wrong answers here are the silent ones: a density this build does not know
 * rendering nothing, or a token from a server that predates a column.
 *
 * Every unreadable token falls back to the honest weaker statement rather than
 * to an assertion. A wet site whose density will not resolve says "Wet"; a
 * collection whose status will not resolve says it was collected, which is what
 * the row's own verb already said.
 */
export function activityBadgeFacts(entry: ActivityRecord): RecordBadgeFacts {
	const detail = text(entry.detail);
	switch (entry.category) {
		case 'habitat':
			return { category: 'habitat', status: lifecycleStatus(detail) };
		case 'trap':
			return {
				category: 'trap',
				status: lifecycleStatus(detail) === 'inactive' ? 'inactive' : 'active',
			};
		case 'inspection':
			return { category: 'inspection', result: inspectionResult(entry) };
		case 'collection':
			return {
				category: 'collection',
				status: collectionStatus(detail),
				hasBycatch: entry.hasBycatch === true,
			};
		case 'biocontrol':
			return { category: 'biocontrol', context: controlContextOf(entry.context) };
		case 'serviceRequest':
			return { category: 'serviceRequest', status: detail === 'closed' ? 'closed' : 'open' };
		// Spelled out rather than left to a `default`, so a tenth record kind
		// fails `tsc` here instead of quietly drawing a row with no badges.
		case 'application':
			return { category: 'application' };
		case 'sourceReduction':
			return { category: 'sourceReduction' };
		case 'outreach':
			return { category: 'outreach' };
	}
}

function lifecycleStatus(detail: string | null): LifecycleStatus {
	if (detail === 'inactive' || detail === 'inaccessible') {
		return detail;
	}
	return 'active';
}

function collectionStatus(detail: string | null): CollectionStatus {
	return COLLECTION_STATUSES.find((status) => status === detail) ?? 'collected';
}

const COLLECTION_STATUSES: readonly CollectionStatus[] = [
	'pending',
	'problem',
	'zero_result',
	'collected',
];

function controlContextOf(context: string | null): ControlContext {
	return context === 'larval' || context === 'adult' ? context : 'standalone';
}

/**
 * What an inspection found, from the two fields the server sends for it.
 *
 * `dry` and a density are the same field, because a dry site has no density to
 * report; the stages ride separately, and an inspection that found none sends
 * nothing rather than six falses.
 */
function inspectionResult(entry: ActivityRecord): InspectionResult {
	const detail = text(entry.detail);
	if (detail === 'dry') {
		return { isWet: false, density: null, stages: null };
	}
	return {
		isWet: true,
		density: detail !== null && isLarvalDensity(detail) ? detail : null,
		stages: lifeStageFlags(entry.stages),
	};
}

/**
 * The `E1234P` codes back into the flags the strip draws.
 *
 * Read by code rather than by position, so a server that gains or loses a stage
 * moves one entry in this table rather than shifting every flag after it.
 */
const LIFE_STAGE_CODES: readonly (readonly [string, keyof LifeStageFlags])[] = [
	['E', 'hasEggs'],
	['1', 'hasFirstInstar'],
	['2', 'hasSecondInstar'],
	['3', 'hasThirdInstar'],
	['4', 'hasFourthInstar'],
	['P', 'hasPupae'],
];

function lifeStageFlags(codes: string | null): LifeStageFlags | null {
	const present = text(codes);
	if (present === null) {
		return null;
	}
	const flags = {
		hasEggs: false,
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
	};
	for (const [code, key] of LIFE_STAGE_CODES) {
		flags[key] = present.includes(code);
	}
	// A string of codes this build knows none of is not "no stages found", it is
	// a server this client cannot read. Say nothing rather than draw six empties.
	return Object.values(flags).some(Boolean) ? flags : null;
}

/**
 * The Tags on one entry, named and coloured from the synced catalog.
 *
 * Ordered by name, which is the order `useEntityTags` returns them in on the
 * explorers, so one record's chips read the same on both surfaces. A tag id
 * this client holds no catalog row for draws nothing: there is no chip to make
 * out of an id.
 */
export function activityTags(
	entry: ActivityRecord,
	tagById: ReadonlyMap<string, Tag>,
): readonly Tag[] {
	if (entry.tagIds === null || entry.tagIds.length === 0) {
		return NO_TAGS;
	}
	return entry.tagIds
		.map((id) => tagById.get(id))
		.filter((tag): tag is Tag => tag !== undefined)
		.sort((first, second) => first.name.localeCompare(second.name));
}

const NO_TAGS: readonly Tag[] = [];

/**
 * The parts of a row that both surfaces drawing an activity record derive from
 * it: Daily Work's log and the nearby list on a service request.
 */
export interface ActivityRowParts {
	readonly title: string;
	/** The describer's subtitle as it stands; what a surface puts around it is its own. */
	readonly subtitle: string | null;
	/** The record kind's name, for a dot's accessible name or a line ahead of the subtitle. */
	readonly categoryLabel: string;
	/** The record's own detail page. */
	readonly link: LinkProps;
	readonly facts: RecordBadgeFacts;
	readonly tags: readonly Tag[];
}

/**
 * One activity record, resolved to what both of its rows draw.
 *
 * The Daily Work row and the nearby row each read the describer, the category
 * label, the detail route, the badge register and the Tags. This answers those
 * once, so a habitat near a request is titled, linked and badged the way the
 * same habitat is in a Profile's log by construction. What each surface adds stays with it: the log's verb and time
 * of day around the subtitle, the nearby list's category ahead of it, and each
 * one's own colour on the dot.
 *
 * A pure resolution rather than a hook or a component, so the nine categories
 * can be asserted through one function.
 */
export function activityRow(record: ActivityRecord, lookups: ActivityLookups): ActivityRowParts {
	const { title, subtitle } = describeActivityEntry(
		record,
		lookups.nameById,
		lookups.formatQuantity,
	);
	return {
		title,
		subtitle,
		categoryLabel: ACTIVITY_CATEGORY_LABEL[record.category],
		link: { to: ACTIVITY_DETAIL_ROUTE[record.category], params: { id: record.id } },
		facts: activityBadgeFacts(record),
		tags: activityTags(record, lookups.tagById),
	};
}

/** What one entry reads as: the explorer row's title and subtitle, minus date and personnel. */
export interface ActivityDescription {
	readonly title: string;
	readonly subtitle: string | null;
}

/**
 * One entry, described the way its own explorer describes it.
 *
 * The nine categories do not share a shape — an application is named by its
 * product and measured in gallons, a source reduction is named by its method,
 * an inspection by the site it was performed at — so a single "label" line
 * reads as "Inspection · Inspected", which tells a supervisor nothing they did
 * not already know from the page they are on. Each row therefore composes what
 * its explorer composes.
 *
 * `nameById` resolves the lookup ids (types, methods, products) from the eagerly
 * synced collections; `placeName` is already text, because habitats and addresses
 * are not synced to the client.
 */
export function describeActivityEntry(
	entry: ActivityRecord,
	nameById: ReadonlyMap<string, string>,
	formatQuantity: (amount: number, unitId: string | null) => string,
): ActivityDescription {
	return DESCRIBE_BY_CATEGORY[entry.category]({
		/** The lookup that names the record's kind. */
		kind: resolve(entry.refId, nameById),
		/** A second lookup, where the record has one. */
		method: resolve(entry.methodRefId, nameById),
		/** The record's own name. */
		own: text(entry.label),
		/** The place it hangs off. */
		place: text(entry.placeName),
		/** What it measured, already in its unit. */
		// `typeof` rather than a null check: a server that predates these columns
		// sends no field at all, and `undefined` reaching the formatter is a crash.
		measured:
			typeof entry.amount === 'number' ? formatQuantity(entry.amount, entry.unitId ?? null) : null,
		/** How many people an outreach action reached. */
		reached: typeof entry.amount === 'number' ? `${formatReach(entry.amount)} reached` : null,
		extra: text(entry.detail),
		fallback: ACTIVITY_CATEGORY_LABEL[entry.category],
	});
}

/** Everything one category's description is composed from, already resolved. */
interface DescriptionParts {
	readonly kind: string | null;
	readonly method: string | null;
	readonly own: string | null;
	readonly place: string | null;
	readonly measured: string | null;
	readonly reached: string | null;
	readonly extra: string | null;
	readonly fallback: string;
}

/**
 * How each category is titled, one line apiece.
 *
 * A table rather than a switch: nine shapes in one function is nine reasons to
 * edit it, and the interesting thing about each is a single expression.
 */
const DESCRIBE_BY_CATEGORY: Readonly<
	Record<ActivityCategory, (parts: DescriptionParts) => ActivityDescription>
> = {
	habitat: (parts) => ({ title: parts.own ?? parts.fallback, subtitle: parts.kind }),
	trap: (parts) => ({ title: parts.own ?? parts.fallback, subtitle: parts.kind }),
	inspection: (parts) => ({ title: parts.place ?? parts.fallback, subtitle: parts.kind }),
	// A collection with no trap was recorded away from one.
	collection: (parts) => ({ title: parts.place ?? 'Ad-hoc collection', subtitle: parts.kind }),
	application: (parts) => ({
		title: parts.kind ?? parts.fallback,
		subtitle: joinParts([parts.measured, parts.method, parts.place]),
	}),
	sourceReduction: (parts) => ({
		title: parts.kind ?? parts.fallback,
		subtitle: joinParts([parts.measured, parts.place]),
	}),
	biocontrol: (parts) => ({
		title: parts.kind ?? parts.fallback,
		subtitle: joinParts([parts.measured, parts.place]),
	}),
	outreach: (parts) => ({
		title: parts.kind ?? parts.fallback,
		subtitle: joinParts([parts.reached, parts.extra, parts.place]),
	}),
	serviceRequest: (parts) => ({ title: parts.own ?? parts.fallback, subtitle: parts.place }),
};

function resolve(id: string | null, nameById: ReadonlyMap<string, string>): string | null {
	return typeof id === 'string' ? (nameById.get(id) ?? null) : null;
}

function text(value: string | null): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** How many people an outreach action reached. */
function formatReach(reach: number): string {
	return reach === 1 ? '1 person' : `${reach.toLocaleString('en-US')} people`;
}

function joinParts(parts: readonly (string | null | undefined)[]): string | null {
	// `typeof` rather than `!== null`: a response that predates one of these
	// columns sends no field, and `undefined.trim()` is a render crash.
	const present = parts.filter(
		(part): part is string => typeof part === 'string' && part.trim() !== '',
	);
	return present.length === 0 ? null : present.join(' · ');
}

/**
 * The time of day, where the record genuinely carries one, in the
 * organization's zone.
 *
 * The server sends an instant; which clock reading that is depends on where you
 * ask. A collector on the road and a supervisor two time zones away have to see
 * the same 9pm, so the organization's zone is the one that answers.
 */
export function formatActivityTime(
	occurredAt: string | null,
	timeZone: string | undefined,
): string | null {
	if (occurredAt === null) {
		return null;
	}
	const parsed = new Date(occurredAt);
	return Number.isNaN(parsed.getTime())
		? null
		: parsed.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				...(timeZone === undefined ? {} : { timeZone }),
			});
}

/**
 * How much of the whole answer this response carries.
 *
 * `total` is what the server counted for the question, which is larger than the
 * list when the row cap bit; before a response arrives it is simply what is on
 * screen, so the header never claims a total it does not have.
 */
export function activityReach(
	response: { readonly total: number; readonly truncated: boolean } | undefined,
	shown: number,
): { readonly total: number; readonly truncated: boolean } {
	return response === undefined ? { total: shown, truncated: false } : response;
}
