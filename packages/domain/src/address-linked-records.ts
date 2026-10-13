/**
 * The vocabulary of an Address's Linked Records: every record whose
 * `address_id` names the Address, grouped into the families the Address page
 * lists them in.
 *
 * A Linked Address is the Address a record named when it was saved. It is not
 * where the work happened and it does not follow the Address when the Address
 * moves (`CONTEXT.md`), so these are the records that name the Address rather
 * than the records near it.
 *
 * It lives in the domain for the reason `profile-activity` does: the reader in
 * `packages/db` and the page in `apps/web` both read it, and one declaration
 * leaves nothing to pin.
 */

/**
 * The ten record kinds that carry an `address_id`. Seven are activity
 * categories and keep that name; the other three have no place in the
 * activity log, because none of them is field work a person did on a day.
 */
export const LINKED_RECORD_CATEGORIES = [
	'serviceRequest',
	'notificationRegistration',
	'inspection',
	'collection',
	'application',
	'sourceReduction',
	'biocontrol',
	'outreach',
	'requestedControlAction',
	'missionItem',
] as const;

export type LinkedRecordCategory = (typeof LINKED_RECORD_CATEGORIES)[number];

/**
 * The families the page lists, in the order its tabs draw them. A Requested
 * Control Action is a record of its own rather than a child of a service
 * request, so it has a family of its own.
 */
export const LINKED_RECORD_FAMILIES = [
	'requests',
	'inspections',
	'collections',
	'controlActions',
	'outreach',
	'requestedControlActions',
	'missionStops',
] as const;

export type LinkedRecordFamily = (typeof LINKED_RECORD_FAMILIES)[number];

/** Which family each record kind is listed under. */
export const LINKED_RECORD_FAMILY_OF: Readonly<Record<LinkedRecordCategory, LinkedRecordFamily>> = {
	serviceRequest: 'requests',
	notificationRegistration: 'requests',
	inspection: 'inspections',
	collection: 'collections',
	application: 'controlActions',
	sourceReduction: 'controlActions',
	biocontrol: 'controlActions',
	outreach: 'outreach',
	requestedControlAction: 'requestedControlActions',
	missionItem: 'missionStops',
};

/**
 * A Mission stop's progress, as the Address page names it. `done` is the
 * stop's `completed_at`; the record that closed it is a separate column
 * (ADR 0012).
 */
export const MISSION_STOP_STATES = ['open', 'done', 'skipped'] as const;

export type MissionStopState = (typeof MISSION_STOP_STATES)[number];
