import type {
	ActivityCategory,
	LinkedRecordCategory,
	LinkedRecordFamily,
	MissionStopState,
} from '@simmer-mosquito/domain';
import { sessionFetch } from '@simmer-mosquito/sync';
import type { LinkProps } from '@tanstack/react-router';
import { getServerUrl } from '../../../auth';
import { missionDisplayName, requestDisplayName } from '../../../hooks/queries/operations-view';
import type { Tag } from '../../../hooks/queries/tag-view';
import { formatCount } from '../../../lib/format-count';
import { formatListDate } from '../../../lib/local-date';
import type { OrganizationClock } from '../../../lib/organization-clock';
import { recordNoun } from '../../../lib/record-nouns';
import type { ActivityLookups, ActivityRowRecord } from '../../activity/activity-data';
import {
	mixedListRowParts,
	recordCountWords,
} from '../../public-engagement/service-requests/service-request-nearby';
import type { RecordBadgeFacts, StateToken } from '../../record/record-badges';

// Data and display helpers for an Address's Linked Records: the records whose
// `address_id` names the Address, one family per tab.

/**
 * One record that names the Address: the activity row's columns, under the
 * linked vocabulary, plus what the three kinds outside the activity log need
 * to be named and linked. `packages/db`'s `LinkedRecordRow` is the server half.
 */
export interface LinkedRecordItem extends Omit<ActivityRowRecord, 'category'> {
	readonly category: LinkedRecordCategory;
	readonly family: LinkedRecordFamily;
	readonly controlType: string | null;
	readonly contactId: string | null;
	readonly contactName: string | null;
	readonly missionId: string | null;
	readonly missionName: string | null;
	readonly missionScheduledStartAt: string | null;
	readonly closedByCategory: ActivityCategory | null;
	readonly closedById: string | null;
	readonly closedByRefId: string | null;
}

/** One family's newest records and how many there are in all. */
export interface LinkedRecordFamilyPage {
	readonly family: LinkedRecordFamily;
	readonly total: number;
	readonly items: readonly LinkedRecordItem[];
}

export interface LinkedRecordsResponse {
	readonly addressId: string;
	/** Every family in tab order, the empty ones included. */
	readonly families: readonly LinkedRecordFamilyPage[];
	/** The per-family cap the endpoint applied. */
	readonly limit: number;
}

/** The read as the card takes it, one object so a suite can build one without a query client. */
export interface LinkedRecordsRead {
	readonly data: LinkedRecordsResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly refetch: () => Promise<unknown>;
}

/** The read itself, exported for the suite that asserts what it asks. */
export async function fetchLinkedRecords(
	addressId: string,
	signal: AbortSignal,
): Promise<LinkedRecordsResponse> {
	const url = new URL(`/records/address/${addressId}/linked-records`, getServerUrl());
	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Linked records request failed (${response.status}).`);
	}
	return (await response.json()) as LinkedRecordsResponse;
}

/**
 * Each family's tab label. The ones that hold one record type read the
 * register; the two that hold several are named for what they share.
 */
export const LINKED_FAMILY_LABEL: Readonly<Record<LinkedRecordFamily, string>> = {
	requests: 'Requests',
	inspections: recordNoun('inspection').titleMany,
	collections: recordNoun('collection').titleMany,
	controlActions: 'Control Actions',
	outreach: 'Outreach',
	requestedControlActions: recordNoun('requestedControlAction').titleMany,
	missionStops: 'Mission Stops',
};

/**
 * What a family's tab says it is showing. The total is the family's whole
 * count, so a family past the cap says it is showing the newest of them; there
 * is no link to the rest until an explorer can filter by address.
 */
export function linkedRecordsCaption(page: LinkedRecordFamilyPage): string {
	if (page.total > page.items.length) {
		return `Newest ${formatCount(page.items.length)} of ${formatCount(page.total)} records that name this address.`;
	}
	return `${recordCountWords(page.total)} ${page.total === 1 ? 'names' : 'name'} this address.`;
}

/** The key one linked record is listed by. The ten kinds are ten tables. */
export function linkedRecordKey(item: Pick<LinkedRecordItem, 'category' | 'id'>): string {
	return `${item.category}:${item.id}`;
}

/** Everything one linked record's row draws, resolved ahead of the render. */
export interface LinkedRecordRow {
	readonly title: string;
	readonly subtitle: string | null;
	readonly date: string | null;
	/** The badge register's facts for an activity kind, or a bare state for the other three. */
	readonly badge:
		| { readonly kind: 'facts'; readonly facts: RecordBadgeFacts }
		| { readonly kind: 'state'; readonly token: StateToken };
	readonly tags: readonly Tag[];
	readonly link: LinkProps;
}

/**
 * One linked record as its row draws it. The seven activity kinds draw
 * through the nearby list's row; a registration, a request for control and a
 * Mission stop are described here, because none of them is in the activity
 * log the shared row describes. Pure, so every kind can be asserted through
 * one function.
 *
 * `addressName` is the page's Address, which every row names and the heading
 * already shows: an activity row whose place is the Address drops it, and one
 * that would be titled by it is titled by its kind.
 */
export function linkedRecordRow(
	item: LinkedRecordItem,
	lookups: ActivityLookups,
	clock: OrganizationClock,
	addressName: string,
): LinkedRecordRow {
	const date = formatListDate(item.date);
	switch (item.category) {
		case 'notificationRegistration':
			return {
				title: item.contactName ?? recordNoun('notificationRegistration').title,
				subtitle: recordNoun('notificationRegistration').title,
				date,
				badge: { kind: 'state', token: item.detail === 'inactive' ? 'inactive' : 'active' },
				tags: NO_TAGS,
				link:
					item.contactId === null
						? { to: '/public-engagement/contacts' }
						: {
								to: '/public-engagement/contacts/$id/registrations',
								params: { id: item.contactId },
							},
			};
		case 'requestedControlAction':
			return {
				title: requestDisplayName({
					summary: item.label,
					controlType: item.controlType ?? '',
				}),
				subtitle: joinParts([
					recordNoun('requestedControlAction').title,
					resolveName(item.refId, lookups),
				]),
				date,
				badge: { kind: 'state', token: item.detail === 'resolved' ? 'resolved' : 'open' },
				tags: NO_TAGS,
				link: { to: '/operations/requests-for-control/$id', params: { id: item.id } },
			};
		case 'missionItem':
			return missionStopRow(item, lookups, clock, date);
		default: {
			const parts = mixedListRowParts({ ...item, category: item.category }, lookups, {
				omitPlaceName: addressName,
			});
			return {
				title: parts.title,
				subtitle: parts.subtitle,
				date,
				badge: { kind: 'facts', facts: parts.facts },
				tags: parts.tags,
				link: parts.link,
			};
		}
	}
}

/**
 * A Mission stop: titled by its Mission and linked to the Mission's page,
 * since a stop has no page of its own. The subtitle names the stop where it
 * was named, and for a done stop the record that closed it (ADR 0012).
 */
function missionStopRow(
	item: LinkedRecordItem,
	lookups: ActivityLookups,
	clock: OrganizationClock,
	date: string,
): LinkedRecordRow {
	const state = missionStopState(item.detail);
	return {
		title:
			item.missionScheduledStartAt === null
				? (item.missionName ?? recordNoun('mission').title)
				: missionDisplayName(
						{
							missionName: item.missionName,
							controlType: item.controlType ?? '',
							scheduledStartAt: item.missionScheduledStartAt,
						},
						clock,
					),
		subtitle: joinParts([
			'Mission Stop',
			item.label,
			state === 'done' ? closedByPhrase(item, lookups) : null,
		]),
		date,
		badge: { kind: 'state', token: state },
		tags: NO_TAGS,
		link:
			item.missionId === null
				? { to: '/operations/missions' }
				: { to: '/operations/missions/$id', params: { id: item.missionId } },
	};
}

function missionStopState(detail: string | null): MissionStopState {
	return detail === 'done' || detail === 'skipped' ? detail : 'open';
}

/** The record kinds a Mission stop can be closed by, as the register names them. */
const CLOSING_NOUN: Readonly<Partial<Record<ActivityCategory, string>>> = {
	application: recordNoun('application').one,
	sourceReduction: recordNoun('sourceReduction').one,
	biocontrol: recordNoun('biocontrolAction').one,
	outreach: recordNoun('outreachAction').one,
};

/**
 * `Closed by chemical application Altosid XR-G`, or the kind alone where its
 * product or method will not resolve. Nothing for a stop marked done with no
 * record against it, because nothing closed it but the mark.
 */
function closedByPhrase(item: LinkedRecordItem, lookups: ActivityLookups): string | null {
	if (item.closedByCategory === null) {
		return null;
	}
	const noun = CLOSING_NOUN[item.closedByCategory] ?? 'record';
	const kind = resolveName(item.closedByRefId, lookups);
	return kind === null ? `Closed by ${noun}` : `Closed by ${noun} ${kind}`;
}

function resolveName(id: string | null, lookups: ActivityLookups): string | null {
	return id === null ? null : (lookups.nameById.get(id) ?? null);
}

function joinParts(parts: readonly (string | null)[]): string | null {
	const present = parts.filter((part): part is string => part !== null && part.trim() !== '');
	return present.length === 0 ? null : present.join(' · ');
}

const NO_TAGS: readonly Tag[] = [];
