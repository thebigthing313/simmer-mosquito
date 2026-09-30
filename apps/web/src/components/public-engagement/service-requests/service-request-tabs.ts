import { recordNoun } from '../../../lib/record-nouns';
import { choiceParam, type FilterCodecs } from '../../../lib/search-filters';
import { NEARBY_FAMILY_LABEL, type NearbyFamily } from './service-request-nearby';
// The six tabs the service request page splits into, the search param that
// names the active one, and what the map is handed per tab.

/**
 * The tabs in the order the strip draws them: the request's own record, one
 * tab per nearby family, the other requests in the radius and window, and the
 * thread.
 */
export const SERVICE_REQUEST_TABS = [
	'details',
	'infrastructure',
	'surveillance',
	'control',
	'serviceRequests',
	'comments',
] as const;

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
 * the page lands on Details.
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
	serviceRequests: NEARBY_FAMILY_LABEL.publicEngagement,
	comments: 'Comments',
};

/**
 * The nearby family each tab lists, or null for the two that list none. The
 * Service Requests tab lists the public-engagement family, which the page
 * narrows to requests by asking the endpoint for no outreach.
 */
const TAB_FAMILY: Readonly<Record<ServiceRequestTab, NearbyFamily | null>> = {
	details: null,
	infrastructure: 'infrastructure',
	surveillance: 'surveillance',
	control: 'control',
	serviceRequests: 'publicEngagement',
	comments: null,
};

/** Whether a string the tab strip hands back is one of the six tabs. */
export function isServiceRequestTab(value: string): value is ServiceRequestTab {
	return SERVICE_REQUEST_TABS.some((tab) => tab === value);
}

/** The family a tab lists, or null for the two tabs that list no nearby records. */
export function tabFamily(tab: ServiceRequestTab): NearbyFamily | null {
	return TAB_FAMILY[tab];
}

/** One tab that lists nearby records, with what its rail says when it lists none. */
export interface NearbyTab {
	readonly tab: ServiceRequestTab;
	readonly family: NearbyFamily;
	readonly emptyDescription: string;
}

/** What each nearby tab's empty state calls the records it would have listed. */
const EMPTY_NOUN: Readonly<Record<NearbyFamily, string>> = {
	infrastructure: 'infrastructure records',
	surveillance: 'surveillance records',
	control: 'control records',
	publicEngagement: recordNoun('serviceRequest').many,
};

/** The four tabs that list nearby records, in strip order. */
export const NEARBY_TABS: readonly NearbyTab[] = SERVICE_REQUEST_TABS.flatMap((tab) => {
	const family = TAB_FAMILY[tab];
	return family === null
		? []
		: [
				{
					tab,
					family,
					emptyDescription: `No ${EMPTY_NOUN[family]} fell within this radius and time window.`,
				},
			];
});

/**
 * Which nearby families the map draws for a tab. A nearby tab draws its own
 * family, so the pins on the map are the rows in the list. Details and
 * Comments draw the other service requests in the radius and window, the
 * rows the Service Requests tab lists, and no operational family.
 */
export function mapFamiliesForTab(tab: ServiceRequestTab): ReadonlySet<NearbyFamily> {
	const family = tabFamily(tab);
	return new Set([family ?? 'publicEngagement']);
}
