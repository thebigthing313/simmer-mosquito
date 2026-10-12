/**
 * Which list a record page was opened from, so the breadcrumb and the sidebar
 * name that list rather than the first one the path matches.
 *
 * A habitat's detail path is `/larval-surveillance/habitats/<id>`, under both
 * the Habitats Map and the Habitats Table, and the path cannot say which one
 * the reader came from. A Table's row links carry `?via=table` instead, and the
 * shell resolves the record under the Table. It is in the URL rather than the
 * history entry's state so a row opened in a new tab keeps it too (#1654). A
 * record opened any other way resolves under its record set.
 */

/** The `via` values a link may carry: the last segment of a sibling list's path. */
export type BreadcrumbVia = 'table';

/** The root route's reading of `via`; anything it does not know is dropped. */
export function parseBreadcrumbVia(raw: unknown): BreadcrumbVia | undefined {
	return raw === 'table' ? raw : undefined;
}

/**
 * The path the shell resolves the trail and the sidebar against: `pathname`
 * re-rooted under the sibling list `via` names, when that list exists.
 * `/larval-surveillance/habitats/<id>` via `table` reads as
 * `/larval-surveillance/habitats/table/<id>`. A `via` naming a list the record
 * has no sibling of, such as a weather station's, which has no Table, leaves
 * `pathname` alone.
 */
export function breadcrumbPath(
	pathname: string,
	via: BreadcrumbVia | undefined,
	isListPath: (path: string) => boolean,
): string {
	if (via === undefined) {
		return pathname;
	}
	const listPath = pathname.slice(0, pathname.lastIndexOf('/'));
	const viaPath = `${listPath}/${via}`;
	if (listPath === '' || !isListPath(viaPath)) {
		return pathname;
	}
	return `${viaPath}${pathname.slice(listPath.length)}`;
}
