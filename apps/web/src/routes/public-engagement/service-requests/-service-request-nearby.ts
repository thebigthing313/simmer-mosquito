import {
	ACTIVITY_CATEGORIES,
	ACTIVITY_FAMILIES,
	type ActivityCategory,
	type ActivityFamily,
	type NearbyWindowEnd,
} from '@simmer-mosquito/domain';
import {
	circlePolygon,
	type GeoJsonFeature,
	type GeoJsonFeatureCollection,
} from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import type { LinkProps } from '@tanstack/react-router';
import { getServerUrl } from '../../../auth';
import { NEARBY_FAMILY_COLORS } from '../../../hooks/map/use-nearby-layer';
import type { Tag } from '../../../hooks/queries/tag-view';
import { formatCount } from '../../../lib/format-count';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { type ActivityLookups, type ActivityRecord, activityRow } from '../../-activity-data';
import type { RecordBadgeFacts } from '../../-record-badges';
import { formatRequestDate } from '../-public-engagement-display';

// Data + display helpers for the service-request map context (nearby records).
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * The families this page asks the endpoint for: all four, since the endpoint's
 * own default is the three operational ones and the Details and Comments tabs
 * draw the other requests around this one (#1090).
 */
const NEARBY_REQUEST_FAMILIES: readonly ActivityFamily[] = ACTIVITY_FAMILIES;

/** The eight record kinds the page reads: every activity category but outreach. */
export type NearbyCategory = Exclude<ActivityCategory, 'outreach'>;

/**
 * The categories it asks for beside the families, which are the eight it
 * draws. The page used to take `publicEngagement` whole and drop the outreach
 * off the answer, and the endpoint's cap ran before that, so dense outreach
 * could cut a nearer request (#1114). `NearbyRecordsInput.categories` in
 * `packages/db` carries the mechanism.
 */
const NEARBY_REQUEST_CATEGORIES: readonly NearbyCategory[] = ACTIVITY_CATEGORIES.filter(
	(category): category is NearbyCategory => category !== 'outreach',
);

/**
 * The page's own grouping of those kinds. The first three are its family tabs,
 * which list and draw the operational records; the fourth is the other service
 * requests, which the map draws under Details and Comments and no tab lists.
 */
export type NearbyFamily = NearbyTabFamily | 'publicEngagement';

/** The three families that are tabs on the page. */
export type NearbyTabFamily = 'infrastructure' | 'surveillance' | 'control';

/**
 * One record near the request: the activity row for that record, less the two
 * fields that say whose entry it is, plus how far away it is. One shape on
 * both endpoints is what lets Daily Work's describer and badge register draw a
 * nearby record too.
 */
export interface NearbyItem extends Omit<ActivityRecord, 'category'> {
	readonly category: NearbyCategory;
	readonly distanceMeters: number;
}

export interface NearbyResponse {
	readonly request: {
		readonly id: string;
		readonly lat: number;
		readonly lng: number;
		readonly requestDate: string;
	};
	readonly radius: { readonly amount: number; readonly unitCode: string; readonly meters: number };
	readonly timeWindow: { readonly daysBefore: number; readonly daysAfter: number };
	readonly dateFrom: string;
	readonly dateTo: string;
	/** Which end set `dateTo`: the setting is a floor, and the close or today can pass it. */
	readonly dateToFrom: NearbyWindowEnd;
	readonly families: readonly ActivityFamily[];
	readonly items: readonly NearbyItem[];
	/** True when more records matched than `limit`, so `items` is the nearest `limit` of them. */
	readonly truncated: boolean;
	/** The endpoint's cap, named here so the page never spells the number itself. */
	readonly limit: number;
}

const NEARBY_FAMILY_OF: Readonly<Record<NearbyCategory, NearbyFamily>> = {
	habitat: 'infrastructure',
	trap: 'infrastructure',
	inspection: 'surveillance',
	collection: 'surveillance',
	application: 'control',
	sourceReduction: 'control',
	biocontrol: 'control',
	serviceRequest: 'publicEngagement',
};

/**
 * The family's name, as the tab strip and the row's dot spell it. The fourth
 * reads the register because it names a record type rather than a group.
 */
export const NEARBY_FAMILY_LABEL: Readonly<Record<NearbyFamily, string>> = {
	infrastructure: 'Infrastructure',
	surveillance: 'Surveillance',
	control: 'Control',
	publicEngagement: recordNoun('serviceRequest').titleMany,
};

/** The three families in the order the tabs draw them. */
export const NEARBY_FAMILIES: readonly {
	readonly key: NearbyTabFamily;
	readonly label: string;
}[] = (['infrastructure', 'surveillance', 'control'] as const).map((key) => ({
	key,
	label: NEARBY_FAMILY_LABEL[key],
}));

/** How many nearby records fell in each family, for the count beside each tab. */
export function countNearbyByFamily(
	items: readonly NearbyItem[],
): Readonly<Record<NearbyFamily, number>> {
	const counts: Record<NearbyFamily, number> = {
		infrastructure: 0,
		surveillance: 0,
		control: 0,
		publicEngagement: 0,
	};
	for (const item of items) {
		counts[NEARBY_FAMILY_OF[item.category]] += 1;
	}
	return counts;
}

/** The records in the given families, nearest first. */
export function visibleNearbyItems(
	items: readonly NearbyItem[],
	visibleFamilies: ReadonlySet<NearbyFamily>,
): readonly NearbyItem[] {
	return items
		.filter((item) => visibleFamilies.has(NEARBY_FAMILY_OF[item.category]))
		.sort((first, second) => first.distanceMeters - second.distanceMeters);
}

/**
 * The read as the page's surfaces take it: the answer and the three facts the
 * rail draws its states from. One object rather than four props, so a tab
 * hands the query on whole and a suite can build one without a query client.
 */
export interface NearbyRead {
	readonly data: NearbyResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly refetch: () => Promise<unknown>;
}

/** The read itself, exported for the suite that asserts what it sends. */
export async function fetchNearby(id: string, signal: AbortSignal): Promise<NearbyResponse> {
	const url = new URL(`/map/service-requests/${id}/nearby`, getServerUrl());
	url.searchParams.set('families', NEARBY_REQUEST_FAMILIES.join(','));
	url.searchParams.set('categories', NEARBY_REQUEST_CATEGORIES.join(','));
	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Nearby request failed (${response.status}).`);
	}
	return (await response.json()) as NearbyResponse;
}

/**
 * The key one nearby record is selected by, on the list and on the map alike.
 *
 * The record id alone is not one: the eight categories are eight tables, and
 * nothing stops a habitat and an inspection sharing a UUID. It is the shape
 * `activityEntryKey` gives Daily Work, less the role, because a record is near
 * a request once however many visits it took.
 */
export function nearbyItemKey(item: Pick<NearbyItem, 'category' | 'id'>): string {
	return `${item.category}:${item.id}`;
}

/**
 * The date the list shows beside a nearby record, or null for a place.
 *
 * The row dates a habitat or a trap by the day its record was created, which
 * is the activity register's rule and what places a person on Daily Work. Next
 * to a request it says nothing about the place, so the list leaves it off, as
 * it did when the row carried no date for a place at all.
 */
export function nearbyItemDate(item: NearbyItem): string | null {
	return NEARBY_FAMILY_OF[item.category] === 'infrastructure' ? null : item.date;
}

/** Everything one nearby record's row draws, resolved ahead of the render. */
export interface NearbyRow {
	readonly title: string;
	readonly subtitle: string | null;
	/** The operational date, formatted for the rail, or null for a place. */
	readonly date: string | null;
	/** How far from the request, in the family of the organization's radius unit. */
	readonly distance: string;
	readonly facts: RecordBadgeFacts;
	readonly tags: readonly Tag[];
	/** The family colour, named for the dot's accessible name. */
	readonly swatch: { readonly color: string; readonly label: string };
	readonly link: LinkProps;
}

/**
 * One nearby record, as its explorer's rail would draw it, plus the distance.
 *
 * The title, the subtitle, the link, the badges and the Tags are the shared
 * row's, so a habitat near a request is titled and badged the way the same
 * habitat is in a Profile's log. What this list adds over that log is the
 * category ahead of the subtitle, because the log's verb is what said
 * "Inspection" there and there is no verb here: an inspection's title is the
 * place it was performed at, and beside a request a reader has to be told it
 * was a visit rather than the place. The distance, the date and the family
 * colour are the other three parts that are this list's own.
 *
 * A pure resolution rather than a component, so the rule this list adds can be
 * asserted through one function and the row that draws it stays a mapping.
 */
export function nearbyRow(item: NearbyItem, lookups: ActivityLookups, unitCode: string): NearbyRow {
	const { title, subtitle, categoryLabel, link, facts, tags } = activityRow(item, lookups);
	const family = NEARBY_FAMILY_OF[item.category];
	const date = nearbyItemDate(item);
	// A record with nothing to name it is titled by its category already, and a
	// subtitle repeating the word under it says nothing twice.
	const parts = [title === categoryLabel ? null : categoryLabel, subtitle].filter(
		(part): part is string => part !== null,
	);
	return {
		title,
		subtitle: parts.length === 0 ? null : parts.join(' · '),
		date: date === null ? null : formatListDate(date),
		distance: formatNearbyDistance(item.distanceMeters, unitCode),
		facts,
		tags,
		swatch: { color: NEARBY_FAMILY_COLORS[family], label: NEARBY_FAMILY_LABEL[family] },
		link,
	};
}

/**
 * The map overlay for the context view: the proximity ring, the request's own
 * marker, and the nearby records (points) for the families the active tab
 * draws, each tagged with the `role`/`family` properties the nearby layer
 * paints on.
 *
 * `id` is the item key rather than the record id, because that is what the
 * layer hands back on a click and what selection is keyed on; the record id
 * rides along as `recordId`.
 */
export function buildNearbyMapData(
	center: { readonly lat: number; readonly lng: number },
	response: NearbyResponse | undefined,
	visibleFamilies: ReadonlySet<NearbyFamily>,
): GeoJsonFeatureCollection {
	const features: GeoJsonFeature[] = [];

	if (response !== undefined) {
		const ring = circlePolygon({ lng: center.lng, lat: center.lat }, response.radius.meters);
		features.push({ type: 'Feature', properties: { role: 'ring' }, geometry: ring });
		for (const item of response.items) {
			const family = NEARBY_FAMILY_OF[item.category];
			if (!visibleFamilies.has(family)) {
				continue;
			}
			features.push({
				type: 'Feature',
				properties: {
					role: 'nearby',
					id: nearbyItemKey(item),
					recordId: item.id,
					family,
					category: item.category,
				},
				geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
			});
		}
	}

	features.push({
		type: 'Feature',
		properties: { role: 'center' },
		geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
	});

	return { type: 'FeatureCollection', features };
}

/** The clause the window phrase adds when an anchor, and not the setting, ended the window. */
const NEARBY_WINDOW_END_CLAUSE: Readonly<Record<NearbyWindowEnd, string>> = {
	setting: '',
	close: ', extended to the day it was closed',
	today: ', extended to today',
};

/**
 * The window as one phrase: the range, and the clause naming which end set
 * it when the setting did not.
 *
 * The summary and the map caption both read it, so the caption cannot draw a
 * six-week range under a setting that says 14 with nothing saying the close or
 * today passed it, which it did while it wrote the two dates itself (#1109).
 * The range is an unspaced en dash in one template, which is the shape
 * `check:copy-dashes` reads.
 */
export function nearbyWindowLabel(
	response: Pick<NearbyResponse, 'dateFrom' | 'dateTo' | 'dateToFrom'>,
): string {
	const range = `${formatRequestDate(response.dateFrom)}–${formatRequestDate(response.dateTo)}`;
	return `${range}${NEARBY_WINDOW_END_CLAUSE[response.dateToFrom]}`;
}

/**
 * What the panel says it is showing, before and after the fetch lands.
 *
 * The count is of the records the family tabs list, so it is the three tab
 * counts added up. The other requests around this one are in the response too,
 * for the map under Details and Comments, and a count that took them in would
 * be one no tab accounts for.
 *
 * The range alone used to be the whole sentence, and it was enough while the
 * window ended `daysAfter` past the request date. That setting is a floor now,
 * and the window runs on to the close, or to today while the request is open
 * (#1084), so a six-week range beside a setting that says 14 needs the
 * sentence to say which end won.
 *
 * The endpoint caps the read nearest-first and says when the cap cut it, and
 * a second sentence says so here, because a radius denser than the cap drew a
 * map that looked complete (#1141). The cap is the answer's own number, so the
 * page never spells it. With the flag clear the summary reads as it did.
 */
export function nearbySummary(response: NearbyResponse | undefined): string {
	if (response === undefined) {
		return 'Records around this request, from your public-engagement settings.';
	}
	const counts = countNearbyByFamily(response.items);
	const count = NEARBY_FAMILIES.reduce((sum, { key }) => sum + counts[key], 0);
	const radius = formatRadiusLabel(response.radius.amount, response.radius.unitCode);
	const window = nearbyWindowLabel(response);
	const summary = `${count === 0 ? 'No' : count} record${count === 1 ? '' : 's'} within ${radius}, ${window}.`;
	if (!response.truncated) {
		return summary;
	}
	return `${summary} Showing the nearest ${formatCount(response.limit)} records only. Narrow the radius or time window in your public-engagement settings to see every record inside them.`;
}

/** Distance shown in the family of the org's radius unit (feet/miles for imperial, m/km otherwise). */
export function formatNearbyDistance(meters: number, unitCode: string): string {
	const imperial = ['mile', 'miles', 'mi', 'foot', 'feet', 'ft', 'yard', 'yd'].includes(
		unitCode.trim().toLowerCase(),
	);
	if (imperial) {
		const feet = meters / 0.3048;
		return feet < 1000 ? `${Math.round(feet)} ft` : `${(feet / 5280).toFixed(2)} mi`;
	}
	return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

const UNIT_ABBREVIATION: Readonly<Record<string, string>> = {
	mile: 'mi',
	kilometer: 'km',
	meter: 'm',
	foot: 'ft',
	yard: 'yd',
};

/** A compact radius label like "0.25 mi". */
export function formatRadiusLabel(amount: number, unitCode: string): string {
	const abbr = UNIT_ABBREVIATION[unitCode.trim().toLowerCase()] ?? unitCode;
	return `${amount} ${abbr}`;
}
