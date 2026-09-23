/**
 * A stored instant as a calendar day, for the organization page's Created and
 * Updated rows.
 *
 * `en-US` because a display formatter reads the same on every machine and a
 * suite may assert the wording. A value that will not parse is handed back
 * rather than drawn as absent, since it arrived and the row would otherwise
 * read like the record carried nothing.
 */
export function formatDate(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? iso
		: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}
