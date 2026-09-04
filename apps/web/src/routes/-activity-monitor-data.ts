import {
	type ActivityCategory,
	type ActivityFamily,
	type ActivityInvolvement,
	isLarvalDensity,
	type LarvalDensity,
} from '@simmer-mosquito/domain';
import { sessionFetch } from '@simmer-mosquito/sync';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServerUrl } from '../auth';
import {
	useApplicationMethodRoster,
	useBiocontrolMethodRoster,
	useCollectionMethodRoster,
	useHabitatTypeRoster,
	useOutreachMethodRoster,
	useSourceReductionMethodRoster,
} from '../hooks/queries/use-catalog-rosters';
import { useInsecticideRecords } from './../hooks/queries/use-insecticide-records';
import { useUnitLabels } from '../hooks/queries/use-unit-labels';
import { formatAmount, insecticideDisplayName } from './control-operations/-control-display';

// Data + display helpers for the Activity Monitor: one Profile's field work over
// a date range. Dash-prefixed so TanStack Router ignores this file as a route.

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
	readonly siteName: string | null;
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
}

interface ActivityResponse {
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

export const ACTIVITY_CATEGORY_LABEL: Readonly<Record<ActivityCategory, string>> = {
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
 * The key one entry is selected by.
 *
 * A collection set on Monday and collected on Thursday is two entries sharing
 * one record id, so the id alone cannot say which visit is selected.
 */
export function activityEntryKey(entry: ActivityEntry): string {
	return `${entry.category}:${entry.id}:${entry.role}`;
}

/** How many entries fell in each family, over the whole range. */
export function countActivityByFamily(
	items: readonly ActivityEntry[],
): Readonly<Record<ActivityFamily, number>> {
	const counts: Record<ActivityFamily, number> = {
		larval: 0,
		adult: 0,
		control: 0,
		publicEngagement: 0,
	};
	for (const item of items) {
		counts[item.family] += 1;
	}
	return counts;
}

export interface ActivityFamilyGroup {
	readonly family: ActivityFamily;
	readonly entries: readonly ActivityEntry[];
}

export interface ActivityDayGroup {
	readonly date: string;
	readonly entries: readonly ActivityEntry[];
	readonly families: readonly ActivityFamilyGroup[];
}

/**
 * The log, as days newest-first, each split into families.
 *
 * Within a family the entries run oldest-first, but only partly: six of the nine
 * categories are dated by a `date` with no time of day, so entries without a
 * timestamp keep the order the server sent and sit after the timed ones.
 * Families keep {@link ACTIVITY_FAMILY_LABELS} order rather than a per-day order, so
 * a week of days reads down the same columns.
 */
export function groupActivityByDay(items: readonly ActivityEntry[]): readonly ActivityDayGroup[] {
	const byDate = new Map<string, ActivityEntry[]>();
	for (const item of items) {
		const day = byDate.get(item.date);
		if (day === undefined) {
			byDate.set(item.date, [item]);
		} else {
			day.push(item);
		}
	}

	return [...byDate.keys()]
		.sort((first, second) => second.localeCompare(first))
		.map((date) => {
			const entries = (byDate.get(date) ?? []).slice().sort(byMoment);
			return {
				date,
				entries,
				families: ACTIVITY_FAMILY_LABELS.map(({ key }) => ({
					family: key,
					entries: entries.filter((entry) => entry.family === key),
				})).filter((group) => group.entries.length > 0),
			};
		});
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
export function useActivityLookups(): {
	readonly nameById: ReadonlyMap<string, string>;
	readonly formatQuantity: (amount: number, unitId: string | null) => string;
} {
	const habitatTypes = useHabitatTypeRoster();
	const collectionMethods = useCollectionMethodRoster();
	const applicationMethods = useApplicationMethodRoster();
	const sourceReductionMethods = useSourceReductionMethodRoster();
	const biocontrolMethods = useBiocontrolMethodRoster();
	const outreachMethods = useOutreachMethodRoster();
	const insecticides = useInsecticideRecords();
	const { all: units } = useUnitLabels();

	return useMemo(() => {
		const nameById = new Map<string, string>();
		for (const row of habitatTypes) {
			nameById.set(row.id, row.name);
		}
		for (const rows of [
			collectionMethods as readonly { readonly id: string; readonly name: string }[],
			applicationMethods,
			sourceReductionMethods,
			biocontrolMethods,
			outreachMethods,
		]) {
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
		};
	}, [
		habitatTypes,
		collectionMethods,
		applicationMethods,
		sourceReductionMethods,
		biocontrolMethods,
		outreachMethods,
		insecticides,
		units,
	]);
}

/**
 * The wording one surface differs from the other by.
 *
 * Two pages read the same log — the Activity Monitor over a window of days and
 * Daily Work over one — and every difference between them is a sentence about
 * dates. Collected here so a page states its wording once instead of the shared
 * parts spelling "range" at a reader who chose a single day.
 */
export interface ActivityCopy {
	/** Nothing was recorded. The explorer frame draws this. */
	readonly empty: { readonly title: string; readonly body: string };
	/** The server declined the question. Its own reason is the body. */
	readonly refusalTitle: string;
	/** What to do about a capped log, where there is anything to do. */
	readonly truncationAdvice: string | null;
}

/** The Activity Monitor's wording: a window with two ends the reader can move. */
export const ACTIVITY_RANGE_COPY: ActivityCopy = {
	empty: {
		title: 'No activity in this range',
		body: 'Nothing is recorded against this person between these dates.',
	},
	refusalTitle: 'That range was not read',
	truncationAdvice: 'Narrow the dates to see all of them.',
};

/**
 * Which of the four non-log states the panel is in, if any.
 *
 * A pure resolution rather than a chain of early returns in the component,
 * because the distinction that matters here is a product one: an outage must
 * never read as an empty day. The two are indistinguishable on the page unless
 * something says which is which, and one of them is a conclusion about a
 * colleague.
 */
export function activityPanelMessage(
	state: {
		readonly hasProfile: boolean;
		readonly isLoading: boolean;
		readonly error: Error | null;
		readonly isEmpty: boolean;
	},
	copy: ActivityCopy = ACTIVITY_RANGE_COPY,
): { readonly title: string; readonly body: string } | 'loading' | null {
	if (!state.hasProfile) {
		return { title: 'Choose a person', body: 'Pick someone to see their field work.' };
	}
	// Loading with entries already on screen is not a loading state: the reader
	// changed the person or the window and the previous log stays until the new
	// one lands, rather than the panel blanking under them.
	if (state.isLoading && state.isEmpty) {
		return 'loading';
	}
	// A refusal says which window was refused; anything else is an outage, and an
	// outage must never read as an empty day.
	if (state.error !== null) {
		return isRefusal(state.error)
			? { title: copy.refusalTitle, body: state.error.message }
			: {
					title: 'Activity could not be loaded',
					body: 'The read failed. Try again in a moment.',
				};
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
 * a reason the frame's copy has nowhere to put: no Profile picked yet, a
 * refusal repeating the window the server declined, or an outage that must
 * never read as a quiet day.
 */
export function activityPanelState(
	state: {
		readonly hasProfile: boolean;
		readonly isLoading: boolean;
		readonly error: Error | null;
		readonly isEmpty: boolean;
	},
	copy: ActivityCopy = ACTIVITY_RANGE_COPY,
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

/** A refusal is the server declining the question, not the read failing. */
function isRefusal(error: Error): boolean {
	return error instanceof ActivityRequestError && error.refused;
}

/**
 * The one status pill an entry reads by, if it has one.
 *
 * The server sends a single short token per category rather than a column per
 * kind, so this is where it becomes a specific badge. It is a pure mapping
 * rather than a chain of conditions inside the component, because "which pill"
 * is the part with the wrong answers in it — an unknown density silently
 * rendering nothing, or a token from a build that predates this column.
 */
export type ActivityStatus =
	| { readonly kind: 'density'; readonly density: LarvalDensity }
	| { readonly kind: 'wetness'; readonly isWet: boolean }
	| { readonly kind: 'state'; readonly token: ActivityStateToken };

export type ActivityStateToken =
	| 'active'
	| 'inactive'
	| 'inaccessible'
	| 'problem'
	| 'zero'
	| 'open'
	| 'closed';

const ACTIVITY_STATE_TOKENS: readonly ActivityStateToken[] = [
	'active',
	'inactive',
	'inaccessible',
	'problem',
	'zero',
	'open',
	'closed',
];

export function activityStatus(entry: ActivityEntry): ActivityStatus | null {
	const detail = text(entry.detail);
	if (detail === null) {
		return null;
	}
	if (entry.category === 'inspection') {
		if (detail === 'dry') {
			return { kind: 'wetness', isWet: false };
		}
		// Wet with nothing counted, or a density this build does not know: say wet
		// rather than assert a value the badge table cannot render.
		return isLarvalDensity(detail)
			? { kind: 'density', density: detail }
			: { kind: 'wetness', isWet: true };
	}
	// Outreach's extra is a description, not a state; it is already in the subtitle.
	if (entry.category === 'outreach') {
		return null;
	}
	return ACTIVITY_STATE_TOKENS.includes(detail as ActivityStateToken)
		? { kind: 'state', token: detail as ActivityStateToken }
		: null;
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
 * synced collections; `siteName` is already text, because habitats and addresses
 * are not synced to the client.
 */
export function describeActivityEntry(
	entry: ActivityEntry,
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
		site: text(entry.siteName),
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
	readonly site: string | null;
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
	inspection: (parts) => ({ title: parts.site ?? parts.fallback, subtitle: parts.kind }),
	// A collection with no trap was recorded away from one.
	collection: (parts) => ({ title: parts.site ?? 'Ad-hoc collection', subtitle: parts.kind }),
	application: (parts) => ({
		title: parts.kind ?? parts.fallback,
		subtitle: joinParts([parts.measured, parts.method, parts.site]),
	}),
	sourceReduction: (parts) => ({
		title: parts.kind ?? parts.fallback,
		subtitle: joinParts([parts.measured, parts.site]),
	}),
	biocontrol: (parts) => ({
		title: parts.kind ?? parts.fallback,
		subtitle: joinParts([parts.measured, parts.site]),
	}),
	outreach: (parts) => ({
		title: parts.kind ?? parts.fallback,
		subtitle: joinParts([parts.reached, parts.extra, parts.site]),
	}),
	serviceRequest: (parts) => ({ title: parts.own ?? parts.fallback, subtitle: parts.site }),
};

function resolve(id: string | null, nameById: ReadonlyMap<string, string>): string | null {
	return typeof id === 'string' ? (nameById.get(id) ?? null) : null;
}

function text(value: string | null): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** How many people an outreach action reached. */
function formatReach(reach: number): string {
	return reach === 1 ? '1 person' : `${reach.toLocaleString()} people`;
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
 * The time of day, where the record genuinely carries one, in the agency's zone.
 *
 * The server sends an instant; which clock reading that is depends on where you
 * ask. A collector on the road and a supervisor two time zones away have to see
 * the same 9pm, so the agency's zone is the one that answers.
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
		: parsed.toLocaleTimeString(undefined, {
				hour: 'numeric',
				minute: '2-digit',
				...(timeZone === undefined ? {} : { timeZone }),
			});
}

/**
 * A refusal the page must repeat rather than swallow — the range was too wide,
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

/** Fetch one Profile's activity. Whole set, server-capped — no paging. */
export function useProfileActivity(input: {
	readonly profileId: string | null;
	readonly dateFrom: string;
	readonly dateTo: string;
}) {
	const { profileId, dateFrom, dateTo } = input;
	return useQuery({
		queryKey: ['profile-activity', profileId, dateFrom, dateTo],
		queryFn: ({ signal }) => fetchProfileActivity(profileId as string, dateFrom, dateTo, signal),
		enabled: profileId !== null && dateFrom !== '' && dateTo !== '',
		staleTime: 30_000,
		// The person and both dates are in the key, so without this every change
		// of either drops a populated log back to placeholder rows. The previous
		// log stays until the new one lands, which is what the rest of the
		// explorers do when the map moves.
		placeholderData: keepPreviousData,
		// A refusal is a permanent answer. Retried, it spends the backoff looking
		// like a slow load, and the operator never learns the window was refused.
		retry: (failureCount, error) =>
			!(error instanceof ActivityRequestError && error.refused) && failureCount < 2,
	});
}

async function fetchProfileActivity(
	profileId: string,
	dateFrom: string,
	dateTo: string,
	signal: AbortSignal,
): Promise<ActivityResponse> {
	const url = new URL(`/map/profiles/${profileId}/activity`, getServerUrl());
	url.searchParams.set('dateFrom', dateFrom);
	url.searchParams.set('dateTo', dateTo);

	const response = await sessionFetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new ActivityRequestError(await refusalReason(response), response.status === 400);
	}
	return (await response.json()) as ActivityResponse;
}

/** The server's own explanation where it gave one; the status code otherwise. */
async function refusalReason(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { readonly reason?: unknown };
		if (typeof body.reason === 'string' && body.reason.trim() !== '') {
			return body.reason;
		}
	} catch {
		// Not JSON; fall through to the status.
	}
	return `Activity request failed (${response.status}).`;
}
