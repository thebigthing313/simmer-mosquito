/** @vitest-environment jsdom */

/**
 * The on-demand reads that call `useLiveQuery` or `useLiveSuspenseQuery`
 * themselves pass the shared gc window (#1628, #1638).
 *
 * `@tanstack/react-db` gives a `useLiveQuery` with no `gcTime` a 1 ms window and
 * a `useLiveSuspenseQuery` a 5 second one, so over an on-demand collection the
 * loaded subset goes soon after the last reader unmounts and the next mount asks
 * Electric for all of it again. These cases read the config each hook hands the
 * live query, so taking the option back out fails here rather than in a network
 * tab.
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useLiveQuery = vi.fn((_config: unknown) => ({ data: [], isReady: true, isError: false }));
const useLiveSuspenseQuery = vi.fn((_config: unknown) => ({ data: [] }));

vi.mock('@tanstack/react-db', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-db')>()),
	useLiveQuery: (config: unknown) => useLiveQuery(config),
	useLiveSuspenseQuery: (config: unknown) => useLiveSuspenseQuery(config),
}));

const { liveQueryGcTimeMs } = await import('../../../../hooks/queries/shared');
const { useHabitatSuspense } = await import('../../../../hooks/queries/use-habitat-suspense');
const { useHabitatSearch } = await import('../../../../hooks/queries/use-habitat-search');
const { useRegistrationDirectory } = await import(
	'../../../../hooks/queries/use-registration-directory'
);

function gcTimePassed(
	hook: typeof useLiveQuery | typeof useLiveSuspenseQuery = useLiveQuery,
): unknown {
	const [config] = hook.mock.lastCall ?? [];
	return (config as { gcTime?: unknown } | undefined)?.gcTime;
}

beforeEach(() => {
	useLiveQuery.mockClear();
	useLiveSuspenseQuery.mockClear();
});

describe('on-demand live queries keep their subset for the shared window', () => {
	it('useRegistrationDirectory passes liveQueryGcTimeMs', () => {
		renderHook(() => useRegistrationDirectory());

		expect(useLiveQuery).toHaveBeenCalled();
		expect(gcTimePassed()).toBe(liveQueryGcTimeMs);
	});

	it('useHabitatSearch passes liveQueryGcTimeMs', () => {
		renderHook(() => useHabitatSearch('org-1', 'catch basin'));

		expect(useLiveQuery).toHaveBeenCalled();
		expect(gcTimePassed()).toBe(liveQueryGcTimeMs);
	});

	it('useHabitatSuspense passes liveQueryGcTimeMs', () => {
		renderHook(() => useHabitatSuspense('h1'));

		expect(useLiveSuspenseQuery).toHaveBeenCalled();
		expect(gcTimePassed(useLiveSuspenseQuery)).toBe(liveQueryGcTimeMs);
	});
});
