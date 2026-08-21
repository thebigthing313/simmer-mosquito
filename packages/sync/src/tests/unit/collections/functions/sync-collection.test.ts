/**
 * What the funnel puts on `shapeOptions`.
 *
 * `syncCollectionConfig` is the one function every table's factory calls, so
 * whatever it sets reaches all fifty-four collections in every app. These assert
 * the config object it returns, which is the whole of what a caller can observe;
 * nothing here reaches into Electric.
 *
 * **The pause itself cannot be tested here.** It lives in the Electric client and
 * needs a real hidden tab. jsdom reports the document as visible, so a vitest run
 * cannot reproduce the hang, and a test claiming to prove the cure would prove
 * nothing. These prove the adapter is wired through; that it cures the hang was
 * measured in a browser and is re-confirmed by loading a page in the Browser
 * pane.
 */

import { describe, expect, it } from 'vitest';
import {
	alwaysVisibleRuntime,
	type RuntimeVisibility,
	syncCollectionConfig,
} from '../../../../collections/functions/sync-collection.js';

interface TestRow {
	readonly id: string;
}

const clientOptions = {
	serverUrl: 'https://example.test',
	syncMode: 'eager',
	mutations: false,
} as const;

describe('syncCollectionConfig', () => {
	it('puts a supplied lifecycle adapter on shapeOptions', () => {
		const config = syncCollectionConfig<TestRow>({
			table: 'units',
			...clientOptions,
			runtimeVisibility: alwaysVisibleRuntime,
		});

		expect(config.shapeOptions.runtimeVisibility).toBe(alwaysVisibleRuntime);
	});

	it('leaves the key absent when no adapter is supplied', () => {
		// Absent, not present-and-undefined. That is the distinction
		// `exactOptionalPropertyTypes` is about, and assigning `undefined` invalidates
		// the config object in a way that surfaces at the call site as a complaint
		// about the schema rather than about this field. The mutation handlers are
		// checked the same way, for the same reason.
		const config = syncCollectionConfig<TestRow>({ table: 'units', ...clientOptions });

		expect('runtimeVisibility' in config.shapeOptions).toBe(false);
	});

	it('leaves the rest of shapeOptions alone when an adapter is supplied', () => {
		// So the option cannot quietly displace the three things a shape request is
		// actually made of.
		const config = syncCollectionConfig<TestRow>({
			table: 'units',
			...clientOptions,
			runtimeVisibility: alwaysVisibleRuntime,
		});

		expect(config.shapeOptions.url).toBe('https://example.test/sync/shapes/units');
		expect(config.shapeOptions.subsetMethod).toBe('POST');
		expect(config.shapeOptions.fetchClient).toBeTypeOf('function');
		expect(Object.keys(config.shapeOptions.parser)).toEqual(['timestamptz']);
	});
});

describe('alwaysVisibleRuntime', () => {
	it('reports visible when the client asks', () => {
		// The client reads this once at subscribe and pauses only on `'hidden'`, so
		// this answer is the one that decides whether a stream born in a hidden tab
		// ever issues a request.
		expect(alwaysVisibleRuntime.getCurrentState?.()).toBe('visible');
	});

	it('delivers visible to a subscriber and unsubscribes without throwing', () => {
		const seen: string[] = [];

		const unsubscribe = alwaysVisibleRuntime.subscribe((state) => seen.push(state));

		expect(seen).toEqual(['visible']);
		expect(() => unsubscribe()).not.toThrow();
	});

	it('satisfies the adapter shape a caller may supply', () => {
		const adapter: RuntimeVisibility = alwaysVisibleRuntime;

		expect(adapter.subscribe).toBeTypeOf('function');
	});
});
