import { useEffect } from 'react';

/**
 * The document title the app shipped with, read once. Every page title is
 * built on it, so `apps/web` reads `… · SIMMER` and `apps/admin` reads
 * `… · SIMMER Operations` without either passing a name.
 */
let shippedTitle: string | undefined;

/**
 * The page's name for a trail: the leaf, then its parent. Two crumbs because
 * the leaf alone is often a surface name shared by several domains, and `Map`
 * in a tab strip says nothing about which map.
 */
export function pageTitle(labels: readonly string[]): string {
	return labels
		.filter((label) => label.trim() !== '')
		.slice(-2)
		.reverse()
		.join(' · ');
}

/**
 * Names the page in the tab, the history list and to a screen reader. The
 * title is set from the breadcrumb trail, and the same words go into a polite
 * status region, because a client-side route change announces nothing on its
 * own: the document never reloads, so assistive technology has no cue that
 * the page under the cursor is a different one. The region reads the page
 * alone, since the app's name is the same on every page.
 */
export function RouteAnnouncer({ labels }: { readonly labels: readonly string[] }) {
	const page = pageTitle(labels);

	useEffect(() => {
		if (shippedTitle === undefined) {
			shippedTitle = document.title;
		}
		document.title = page === '' ? shippedTitle : `${page} · ${shippedTitle}`;
	}, [page]);

	return (
		<p aria-live="polite" className="sr-only" role="status">
			{page}
		</p>
	);
}
