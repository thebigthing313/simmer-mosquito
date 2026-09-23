/**
 * Where to send a reader whose session has ended, or `null` for a page that
 * needs no session. The destination is the app's sign-in path carrying where
 * they were as `redirect`. `location` is written out rather than typed as the
 * DOM's `Location`, because this package compiles without the DOM library.
 */
export function sessionLostDestination(options: {
	readonly signInPath: string;
	readonly publicPaths: ReadonlySet<string>;
	readonly location: {
		readonly origin: string;
		readonly pathname: string;
		readonly search: string;
		readonly hash: string;
	};
}): string | null {
	const { location } = options;
	if (options.publicPaths.has(location.pathname)) {
		return null;
	}

	const destination = new URL(options.signInPath, location.origin);
	destination.searchParams.set(
		'redirect',
		`${location.pathname}${location.search}${location.hash}`,
	);

	return destination.toString();
}
