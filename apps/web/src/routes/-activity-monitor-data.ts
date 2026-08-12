import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';

// Data + display helpers for the Activity Monitor: one Profile's field work over
// a date range. Dash-prefixed so TanStack Router ignores this file as a route.

export type ActivityCategory =
	| 'habitat'
	| 'inspection'
	| 'trap'
	| 'collection'
	| 'application'
	| 'sourceReduction'
	| 'biocontrol'
	| 'outreach'
	| 'serviceRequest';

export type ActivityFamily = 'larval' | 'adult' | 'control' | 'publicEngagement';

export type ActivityInvolvement = 'primary' | 'assisting';

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
	readonly label: string | null;
	readonly refId: string | null;
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

export const ACTIVITY_FAMILIES: readonly {
	readonly key: ActivityFamily;
	readonly label: string;
}[] = [
	{ key: 'larval', label: 'Larval surveillance' },
	{ key: 'adult', label: 'Adult surveillance' },
	{ key: 'control', label: 'Control actions' },
	{ key: 'publicEngagement', label: 'Public engagement' },
];

export const ACTIVITY_CATEGORY_LABEL: Readonly<Record<ActivityCategory, string>> = {
	habitat: 'Habitat',
	inspection: 'Inspection',
	trap: 'Trap',
	collection: 'Collection',
	application: 'Application',
	sourceReduction: 'Source reduction',
	biocontrol: 'Biocontrol',
	outreach: 'Outreach',
	serviceRequest: 'Service request',
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
 * Families keep {@link ACTIVITY_FAMILIES} order rather than a per-day order, so
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
				families: ACTIVITY_FAMILIES.map(({ key }) => ({
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

/** The time of day, where the record genuinely carries one. */
export function formatActivityTime(occurredAt: string | null): string | null {
	if (occurredAt === null) {
		return null;
	}
	const parsed = new Date(occurredAt);
	return Number.isNaN(parsed.getTime())
		? null
		: parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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

	const response = await fetch(url, { credentials: 'include', signal });
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
