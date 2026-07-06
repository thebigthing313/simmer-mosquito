/**
 * Set this to an ISO date string (e.g. `'2025-08-14'` or a full datetime) to
 * pin the app's notion of "today" to a fixed date. Useful for developing and
 * demoing against seed/prod snapshots whose data lives on a specific date —
 * the day strips, activity windows, and header date all follow this override.
 *
 * Leave `null` for real behaviour (the actual current date).
 */
// Pinned to 2026-05-27 — the latest dense day in the current dev/prod-clone
// snapshot (221 inspections, samples + species identifications in the trailing
// 7d/30d windows), so the larval-surveillance dashboards populate on load.
// Note the local-noon time: getToday() returns a Date that gets formatted in
// the org timezone, and a bare `'2026-05-27'` (UTC midnight) would roll back a
// day in US timezones — noon keeps it on the intended calendar date.
const TODAY_OVERRIDE: string | null = '2026-05-27T12:00:00';

/**
 * The app's single source of truth for "today's date".
 *
 * Returns the real current date, unless {@link TODAY_OVERRIDE} is set, in which
 * case it returns that fixed date. Every place that needs the current calendar
 * day (data windows, the header date, etc.) should call this instead of
 * `new Date()` so the override takes effect everywhere at once.
 */
export function getToday(): Date {
	return TODAY_OVERRIDE ? new Date(TODAY_OVERRIDE) : new Date();
}
