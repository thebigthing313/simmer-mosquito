/** @vitest-environment jsdom */

/**
 * The on-demand reads that call `useLiveQuery` themselves pass the shared gc
 * window (#1628).
 *
 * `@tanstack/react-db` gives a `useLiveQuery` with no `gcTime` a 1 ms window, so
 * over an on-demand collection the loaded subset goes as soon as the last reader
 * unmounts and the next mount asks Electric for all of it again. These cases
 * read the config each hook hands the live query, so taking the option back out
 * fails here rather than in a network tab.
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useLiveQuery = vi.fn((_config: unknown) => ({ data: [], isReady: true, isError: false }));

vi.mock('@tanstack/react-db', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-db')>()),
	useLiveQuery: (config: unknown) => useLiveQuery(config),
}));

const { liveQueryGcTimeMs } = await import('../../../../hooks/queries/shared');
const { useHabitatSearch } = await import('../../../../hooks/queries/use-habitat-search');
const { useRegistrationDirectory } = await import(
	'../../../../hooks/queries/use-registration-directory'
);

function gcTimePassed(): unknown {
	const [config] = useLiveQuery.mock.lastCall ?? [];
	return (config as { gcTime?: unknown } | undefined)?.gcTime;
}

beforeEach(() => {
	useLiveQuery.mockClear();
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
});
