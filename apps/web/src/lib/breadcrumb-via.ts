/**
 * Which list a record page was opened from, so the breadcrumb and the sidebar
 * name that list rather than the first one the path matches.
 *
 * A habitat's detail path is `/larval-surveillance/habitats/<id>`, and the
 * longest navigation item it matches is the Habitats Map, so the trail said
 * "Map" even for a reader who clicked the row in the Table. The path cannot say
 * otherwise, since both lists open the same route. The Table's links put the
 * Table's path in the history entry's state instead, where it survives a reload
 * and a Back, and a record opened any other way resolves as it always did.
 */

declare module '@tanstack/react-router' {
	interface HistoryState {
		/** The list path a record page was opened from. See `lib/breadcrumb-via.ts`. */
		readonly breadcrumbVia?: string;
	}
}

/**
 * The path the shell resolves the trail and the sidebar against: `pathname`
 * re-rooted under `via` when `via` is a sibling list of the record's own.
 * `/larval-surveillance/habitats/<id>` via `/larval-surveillance/habitats/table`
 * reads as `/larval-surveillance/habitats/table/<id>`. Anything else, including
 * a `via` from a different part of the app, leaves `pathname` alone.
 */
export function breadcrumbPath(pathname: string, via: string | undefined): string {
	if (via === undefined || via === '') {
		return pathname;
	}
	const listPath = pathname.slice(0, pathname.lastIndexOf('/'));
	if (listPath === '' || !via.startsWith(`${listPath}/`)) {
		return pathname;
	}
	return `${via}${pathname.slice(listPath.length)}`;
}
