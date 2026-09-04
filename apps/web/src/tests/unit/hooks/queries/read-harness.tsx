/**
 * Rendering a read hook against collections that hold rows and nothing else.
 *
 * The suites beside this one install the memory source, seed the tables the
 * hook reads, and assert on what comes back: the join, the ordering, the
 * predicate and the projection, which is the whole of what a read hook is.
 * None of it was reachable while a collection module built its collection at
 * import.
 *
 * What is deliberately not faked is the query engine. These are real TanStack
 * DB collections and a real live query, so a `left` that should have been an
 * `inner`, an `orderBy` on the wrong column, and a `select` that reads a column
 * the table does not have all fail here rather than on a page.
 */

import { type RenderHookResult, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';

/**
 * Render a read hook and wait for its first non-suspended result.
 *
 * The Suspense boundary is here for the hooks built on
 * `useLiveSuspenseQuery`, which is most of the detail pages. A hook that does
 * not suspend renders straight through it, so one helper covers both and a
 * suite does not have to know which kind it is calling.
 */
export async function renderRead<TResult>(
	hook: () => TResult,
): Promise<RenderHookResult<TResult, undefined>> {
	const rendered = renderHook(hook, {
		wrapper: ({ children }: { readonly children: ReactNode }) => (
			<Suspense fallback={null}>{children}</Suspense>
		),
	});
	await waitFor(() => {
		if (rendered.result.current === null) throw new Error('still suspended');
	});
	return rendered;
}

/**
 * A projected row without the bookkeeping the engine hangs on it.
 *
 * A live query result carries `$collectionId`, `$key`, `$origin` and `$synced`
 * as ordinary enumerable properties, so a whole-object comparison is otherwise
 * a comparison against library internals. Stripping them keeps a test about the
 * projection the hook wrote.
 */
export function plain<TRow extends object>(row: TRow): Record<string, unknown> {
	return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('$'))) as Record<
		string,
		unknown
	>;
}
