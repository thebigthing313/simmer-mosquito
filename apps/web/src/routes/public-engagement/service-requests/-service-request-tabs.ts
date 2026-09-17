import { choiceParam, type FilterCodecs } from '../../../lib/search-filters';
import {
	NEARBY_FAMILY_LABEL,
	type NearbyFamily,
	type NearbyTabFamily,
} from './-service-request-nearby';

// The five tabs the service request page splits into, the search param that
// names the active one, and what the map is handed per tab.
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * The tabs in the order the strip draws them: the request's own record, one
 * tab per nearby family in `NEARBY_FAMILIES` order, and the thread.
 */
export const SERVICE_REQUEST_TABS = [
	'details',
	'infrastructure',
	'surveillance',
	'control',
	'comments',
] as const satisfies readonly (NearbyTabFamily | 'details' | 'comments')[];

export type ServiceRequestTab = (typeof SERVICE_REQUEST_TABS)[number];

/** The tab the page opens on, and the one that stays out of the URL. */
const DEFAULT_SERVICE_REQUEST_TAB: ServiceRequestTab = 'details';

export interface ServiceRequestTabSearch {
	readonly tab: ServiceRequestTab;
}

export const SERVICE_REQUEST_TAB_DEFAULTS: ServiceRequestTabSearch = {
	tab: DEFAULT_SERVICE_REQUEST_TAB,
};

/**
 * `?tab=` as a search codec, so the route's `validateSearch` and the page's
 * read are one declaration. A value that is not a tab decodes to nothing and
 * the page lands on Details, which is what a hand-edited or truncated link
 * should do rather than an error boundary.
 */
export const SERVICE_REQUEST_TAB_CODECS: FilterCodecs<ServiceRequestTabSearch> = {
	tab: choiceParam(SERVICE_REQUEST_TABS, DEFAULT_SERVICE_REQUEST_TAB),
};

/** The tab's label as the strip draws it. */
export const SERVICE_REQUEST_TAB_LABEL: Readonly<Record<ServiceRequestTab, string>> = {
	details: 'Details',
	infrastructure: NEARBY_FAMILY_LABEL.infrastructure,
	surveillance: NEARBY_FAMILY_LABEL.surveillance,
	control: NEARBY_FAMILY_LABEL.control,
	comments: 'Comments',
};

/** Whether a string the tab strip hands back is one of the five tabs. */
export function isServiceRequestTab(value: string): value is ServiceRequestTab {
	return SERVICE_REQUEST_TABS.some((tab) => tab === value);
}

/** The family a tab lists, or null for the two tabs that list no nearby records. */
export function tabFamily(tab: ServiceRequestTab): NearbyTabFamily | null {
	return tab === 'details' || tab === 'comments' ? null : tab;
}

/**
 * Which nearby families the map draws for a tab.
 *
 * A family tab draws its own family and nothing else, so the pins on the map
 * are the rows in the list. Details and Comments draw no operational family
 * and the other service requests in the radius and window instead (#1090):
 * what a reader wants beside the request's own facts and its thread is what
 * else was reported around it, and the operational records have a tab each.
 * Nothing lists those requests, so this is the one place they are drawn from.
 * This is the one function that decides what the map is handed per tab.
 */
export function mapFamiliesForTab(tab: ServiceRequestTab): ReadonlySet<NearbyFamily> {
	const family = tabFamily(tab);
	return new Set([family ?? 'publicEngagement']);
}
