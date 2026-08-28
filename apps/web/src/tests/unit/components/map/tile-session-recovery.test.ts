/**
 * Renewing the session for the one fetch the app does not make itself.
 *
 * Every other credentialed request goes through `sessionFetch`, which answers a
 * 401 by renewing once and asking again. Mapbox GL fetches MVT tiles itself, so
 * a tile that meets an expired access token is refused with nothing to catch it:
 * the record layers draw empty and stay empty until something else makes the map
 * ask again (#300).
 *
 * These cover the three decisions that shape has: which refusals are ours, how a
 * refetch is forced, and how a persistent refusal is kept from becoming a loop.
 */

import { describe, expect, it, vi } from 'vitest';
import {
	createTileSessionRecovery,
	isRefusedServerTile,
	refetchServerTileSources,
} from '../../../../components/map/tile-session-recovery';

const SERVER = 'https://api.example.test';
const TILE = `${SERVER}/map/tiles/habitats/10/300/387.mvt`;

function refusal(status: number, url: string): { readonly error: unknown } {
	return { error: Object.assign(new Error('AJAXError'), { status, url }) };
}

describe('isRefusedServerTile', () => {
	it('claims a 401 from our own tile server', () => {
		expect(isRefusedServerTile(refusal(401, TILE), SERVER)).toBe(true);
	});

	it('leaves a 401 from anywhere else alone', () => {
		// Mapbox's own style, sprite, glyph and basemap requests come through the
		// same event. Renewing our session cannot help them and the reader would be
		// signed out over somebody else's outage.
		expect(isRefusedServerTile(refusal(401, 'https://api.mapbox.com/styles/v1'), SERVER)).toBe(
			false,
		);
	});

	it('leaves every other status alone', () => {
		// 403 is a decided answer, and 404 or 500 are not about the session. Only a
		// 401 is worth a renewal, the same rule `sessionFetch` follows.
		expect(
			[403, 404, 500].map((status) => isRefusedServerTile(refusal(status, TILE), SERVER)),
		).toEqual([false, false, false]);
	});

	it('survives an error that carries neither a status nor a URL', () => {
		// GL emits plenty of errors that are not HTTP at all.
		expect(isRefusedServerTile({ error: new Error('WebGL context lost') }, SERVER)).toBe(false);
		expect(isRefusedServerTile({ error: undefined }, SERVER)).toBe(false);
	});

	it('claims nothing when the server origin is unknown', () => {
		expect(isRefusedServerTile(refusal(401, TILE), null)).toBe(false);
	});
});

describe('refetchServerTileSources', () => {
	function mapWith(
		sources: Record<string, { type: string; tiles?: string[] }>,
		options?: { readonly liveTiles?: Record<string, string[]> },
	) {
		const setTiles = vi.fn();
		return {
			setTiles,
			map: {
				getStyle: () => ({ sources }),
				getSource: (id: string) => {
					if (!(id in sources)) {
						return undefined;
					}
					// Only a vector tile source has `setTiles`, which is how the real one
					// is told apart from a raster, GeoJSON, image or canvas source.
					if (sources[id]?.type !== 'vector') {
						return {};
					}
					return { setTiles, tiles: options?.liveTiles?.[id] ?? sources[id]?.tiles };
				},
			},
		};
	}

	it('re-points our vector sources at the same URLs, which is what forces a refetch', () => {
		const { map, setTiles } = mapWith({
			habitats: { type: 'vector', tiles: [TILE] },
		});

		expect(refetchServerTileSources(map, SERVER)).toBe(1);
		expect(setTiles).toHaveBeenCalledWith([TILE]);
	});

	it('leaves the basemap alone', () => {
		// Mapbox's tiles never carried our session and were never refused.
		const { map, setTiles } = mapWith({
			habitats: { type: 'vector', tiles: [TILE] },
			basemap: { type: 'raster', tiles: ['https://api.mapbox.com/v4/{z}/{x}/{y}.png'] },
		});

		expect(refetchServerTileSources(map, SERVER)).toBe(1);
		expect(setTiles).toHaveBeenCalledOnce();
	});

	it('reports nothing refetched when the style has no sources of ours', () => {
		const { map } = mapWith({});

		expect(refetchServerTileSources(map, SERVER)).toBe(0);
	});

	it('reads the URLs off the live source, not off the style', () => {
		// A source's serialised form is GL's to choose: a vector source may describe
		// itself with a TileJSON `url` and no `tiles` at all. Reading the live object
		// keeps this from going quietly inert if that ever changes, which would look
		// exactly like the bug it fixes.
		const { map, setTiles } = mapWith(
			{ habitats: { type: 'vector' } },
			{ liveTiles: { habitats: [TILE] } },
		);

		expect(refetchServerTileSources(map, SERVER)).toBe(1);
		expect(setTiles).toHaveBeenCalledWith([TILE]);
	});

	it('answers zero rather than throwing when the map has been removed', () => {
		// Reading the style of a removed map throws, and this runs from an error
		// handler that can fire during teardown.
		const removed = {
			getStyle: () => {
				throw new Error('Map has been removed');
			},
			getSource: () => undefined,
		};

		expect(refetchServerTileSources(removed, SERVER)).toBe(0);
	});
});

describe('createTileSessionRecovery', () => {
	function harness(options?: { readonly recovers?: boolean }) {
		const recoverSession = vi.fn(async () => options?.recovers ?? true);
		const refetch = vi.fn(() => 1);
		let clock = 0;

		return {
			recoverSession,
			refetch,
			tick: (ms: number) => {
				clock += ms;
			},
			recover: createTileSessionRecovery({
				recoverSession,
				refetch,
				serverOrigin: SERVER,
				now: () => clock,
			}),
		};
	}

	it('renews and refetches when one of our tiles is refused', async () => {
		const { recover, recoverSession, refetch } = harness();

		await recover(refusal(401, TILE));

		expect(recoverSession).toHaveBeenCalledOnce();
		expect(refetch).toHaveBeenCalledOnce();
	});

	it('renews once for a whole screenful of refused tiles', async () => {
		// A map viewport is a dozen tiles and GL emits an error event for each. One
		// renewal for the burst, one refetch, or the session is renewed twelve times
		// over for one expiry.
		const { recover, recoverSession, refetch } = harness();

		await Promise.all(Array.from({ length: 12 }, () => recover(refusal(401, TILE))));

		expect(recoverSession).toHaveBeenCalledOnce();
		expect(refetch).toHaveBeenCalledOnce();
	});

	it('does not refetch when the session is gone', async () => {
		// The app is signing the reader out. Asking for the tiles again would race
		// that and refuse again.
		const { recover, refetch } = harness({ recovers: false });

		await recover(refusal(401, TILE));

		expect(refetch).not.toHaveBeenCalled();
	});

	it('refuses to spin when the refusal outlives the renewal', async () => {
		// The failure worth more than the retry. A tile refused for a reason a
		// session cannot fix would otherwise renew, refetch, be refused, and repeat
		// at network speed for as long as the map is open.
		const { recover, recoverSession, tick } = harness();

		await recover(refusal(401, TILE));
		await recover(refusal(401, TILE));
		tick(29_000);
		await recover(refusal(401, TILE));

		expect(recoverSession).toHaveBeenCalledOnce();
	});

	it('tries again once the cooldown has passed', async () => {
		// A later expiry is a new problem, not the same one repeating.
		const { recover, recoverSession, tick } = harness();

		await recover(refusal(401, TILE));
		tick(31_000);
		await recover(refusal(401, TILE));

		expect(recoverSession).toHaveBeenCalledTimes(2);
	});

	it('ignores an error that is not one of ours', async () => {
		const { recover, recoverSession } = harness();

		await recover(refusal(401, 'https://api.mapbox.com/styles/v1'));
		await recover({ error: new Error('WebGL context lost') });

		expect(recoverSession).not.toHaveBeenCalled();
	});
});
