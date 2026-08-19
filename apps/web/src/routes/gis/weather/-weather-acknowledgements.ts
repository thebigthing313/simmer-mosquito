/**
 * The three weather refusals a manager is allowed to answer, and the flag that
 * answers each.
 *
 * All three turn on the same fact — the station already has summaries — which
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
 */
export const STATION_REFUSALS: Readonly<Record<string, string>> = {
	weather_station_identity_change_unacknowledged: 'acknowledgedHistoricalStationIdentityChange',
	weather_station_location_change_unacknowledged: 'acknowledgedHistoricalLocationChange',
	weather_station_summary_deletion_unacknowledged: 'acknowledgedSummaryDeletion',
};

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

/**
 * The refusals the import can answer, which are about a batch rather than a
 * station.
 *
 * Kept apart from the station map so a dialog about overwriting spreadsheet rows
 * cannot offer to delete a station's summaries.
 */
export const IMPORT_REFUSALS: Readonly<Record<string, string>> = {
	weather_import_updates_unacknowledged: 'acknowledgedUpdates',
	weather_import_partial_unacknowledged: 'acknowledgedPartialImport',
};
