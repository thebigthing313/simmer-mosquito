/**
 * The three weather refusals a manager is allowed to answer, and the flag that
 * answers each.
 *
 * All three turn on the same fact, the station already has summaries, which
 * the client cannot know without loading them and the server has in front of it
 * anyway. So none of them is a checkbox on the form. The write goes out plain,
 * and a station with no readings never raises a question at all.
 *
 * What each one is really asking:
 *
 * - **Identity.** Summaries do not record what the station was called, so a
 *   rename relabels every reading ever taken there, retroactively.
 * - **Location.** Summaries do not record where the station stood either, so
 *   moving the pin moves all of that history to the new spot.
 * - **Summary deletion.** Deleting a station hard-deletes its readings. It is
 *   the only weather write that destroys data.
 *
 * The values are the payload keys the endpoint reads, so a typo here is a
 * question the user answers and the server never hears.
 *
 * Key and value are the same word because all three now arrive on the settled
 * `acknowledgement_required` body, which names the flag itself rather than a
 * refusal code of its own (#315, #317). The map stays a map: it is what says
 * which questions *this page* is allowed to answer, so a station page cannot
 * offer a technician the answer to a mission stop's question.
 */
export const STATION_REFUSALS = {
	acknowledgedHistoricalStationIdentityChange: 'acknowledgedHistoricalStationIdentityChange',
	acknowledgedHistoricalLocationChange: 'acknowledgedHistoricalLocationChange',
} as const satisfies Readonly<Record<string, string>>;

/**
 * The delete's own refusal, kept apart from the edit's two.
 *
 * One map for all three would put the question that agrees to destroy a
 * station's readings behind the edit page's wording, and the labels travel with
 * the map: the dialog would be headed "Change the station anyway?" over a button
 * reading "Change it", for an action that permanently deletes every summary.
 */
export const STATION_DELETE_REFUSALS = {
	acknowledgedSummaryDeletion: 'acknowledgedSummaryDeletion',
} as const satisfies Readonly<Record<string, string>>;

/**
 * The wording of the question.
 *
 * Deliberately not "Record it": nothing here is being recorded. Every one of the
 * three rewrites or removes readings that already exist, and the button should
 * say that is what the user is agreeing to.
 */
export const STATION_ACKNOWLEDGEMENT_LABELS = {
	title: 'Change the station anyway?',
	confirm: 'Change it',
	fallbackReason: 'This station already has summaries recorded against it.',
} as const;

/** The delete's wording, which has to say that readings are being destroyed. */
export const STATION_DELETE_LABELS = {
	title: 'Delete the readings too?',
	confirm: 'Delete them',
	fallbackReason:
		'This station already has summaries recorded against it, and deleting it deletes them.',
} as const;

/**
 * The refusals the import can answer, which are about a batch rather than a
 * station.
 *
 * Kept apart from the station map so a dialog about overwriting spreadsheet rows
 * cannot offer to delete a station's summaries.
 */
export const IMPORT_REFUSALS = {
	weather_import_updates_unacknowledged: 'acknowledgedUpdates',
	weather_import_partial_unacknowledged: 'acknowledgedPartialImport',
} as const satisfies Readonly<Record<string, string>>;
