/** @vitest-environment jsdom */

/**
 * The geometry of the mission stop a control action form was opened from.
 *
 * The Electric shape for `mission_items` carries the centroid alone, so the stop's
 * line or area comes from the mission's own map read, which answers every stop
 * on the mission at once. A stop the answer does not name is a failure rather
 * than an empty map (#1233).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const MISSION = '11111111-1111-4111-8111-111111111111';
const STOP = '22222222-2222-4222-8222-222222222222';
const OTHER_STOP = '33333333-3333-4333-8333-333333333333';
const STOP_LINE = {
	type: 'LineString',
	coordinates: [
		[-74.41, 40.52],
		[-74.4, 40.53],
	],
};

const sent: URL[] = [];
let answer: () => { readonly status: number; readonly body?: unknown } = () => ({ status: 200 });
/** Holds the next response back while a case looks at the read in flight. */
let hold: Promise<void> = Promise.resolve();

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: async (input: URL) => {
		sent.push(input);
		await hold;
		const { status, body } = answer();
		return {
			ok: status >= 200 && status < 300,
			status,
			json: () => Promise.resolve(body),
		} as Response;
	},
}));

const { useMissionStopGeometry } = await import(
	'../../../../hooks/operations/use-mission-stop-geometry'
);

function wrapper({ children }: { readonly children: ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function missionItems(rows: readonly { readonly id: string; readonly geojson: unknown }[]) {
	return { status: 200, body: { missionItems: rows } };
}

afterEach(() => {
	sent.length = 0;
	hold = Promise.resolve();
	answer = () => ({ status: 200 });
});

describe('useMissionStopGeometry', () => {
	it('is null off a mission stop, and reads nothing', () => {
		const { result } = renderHook(
			() => useMissionStopGeometry({ missionId: null, missionItemId: null }),
			{
				wrapper,
			},
		);

		expect(result.current).toBeNull();
		expect(sent).toHaveLength(0);
	});

	it("picks the stop's geometry out of the mission's", async () => {
		answer = () =>
			missionItems([
				{ id: OTHER_STOP, geojson: { type: 'Point', coordinates: [-74, 40] } },
				{ id: STOP, geojson: STOP_LINE },
			]);

		const { result } = renderHook(
			() => useMissionStopGeometry({ missionId: MISSION, missionItemId: STOP }),
			{ wrapper },
		);

		expect(result.current).toEqual({ status: 'loading' });
		await waitFor(() => expect(result.current).toEqual({ status: 'ready', geometry: STOP_LINE }));
		expect(sent.map((url) => url.pathname)).toEqual([`/map/missions/${MISSION}/items`]);
	});

	it('fails on a stop the mission does not name', async () => {
		answer = () => missionItems([{ id: OTHER_STOP, geojson: STOP_LINE }]);

		const { result } = renderHook(
			() => useMissionStopGeometry({ missionId: MISSION, missionItemId: STOP }),
			{ wrapper },
		);

		await waitFor(() => expect(result.current?.status).toBe('error'));
	});

	it('fails on a refused read, and retries it', async () => {
		answer = () => ({ status: 500 });

		const { result } = renderHook(
			() => useMissionStopGeometry({ missionId: MISSION, missionItemId: STOP }),
			{ wrapper },
		);
		await waitFor(() => expect(result.current?.status).toBe('error'));

		answer = () => missionItems([{ id: STOP, geojson: STOP_LINE }]);
		let release: () => void = () => undefined;
		hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		const failed = result.current;
		act(() => {
			if (failed?.status === 'error') {
				failed.retry?.();
			}
		});

		// Loading while the retry runs, rather than still reading as failed.
		await waitFor(() => expect(result.current).toEqual({ status: 'loading' }));
		release();
		await waitFor(() => expect(result.current).toEqual({ status: 'ready', geometry: STOP_LINE }));
		expect(sent).toHaveLength(2);
	});

	it('fails on a stop link that names no mission', () => {
		const { result } = renderHook(
			() => useMissionStopGeometry({ missionId: null, missionItemId: STOP }),
			{ wrapper },
		);

		expect(result.current).toEqual({ status: 'error', retry: null });
		expect(sent).toHaveLength(0);
	});
});
