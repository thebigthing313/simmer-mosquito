import type mapboxgl from 'mapbox-gl';

/**
 * Lazily loads the Mapbox GL runtime, once per session.
 *
 * mapbox-gl is ~1.7 MB minified — by a wide margin the largest thing we ship,
 * and bigger than the entire rest of the app put together. It is also needed by
 * a minority of routes: overviews, tables, settings, and every form without a
 * map never touch it.
 *
 * Chunk configuration alone could not keep it out of the boot payload. The
 * generated route tree imports all ~95 route modules eagerly (that is how the
 * router knows the tree before any navigation), so a *static* `import` of
 * mapbox-gl anywhere in that graph makes it a static dependency of the entry
 * chunk no matter which output chunk it is filed under — it was still being
 * `modulepreload`ed on every cold load. A dynamic import is what actually moves
 * it off the critical path, because it becomes a separate module graph the
 * browser only fetches when something calls this.
 *
 * The promise is cached, so the second map surface in a session resolves from
 * the module registry in a microtask rather than re-fetching.
 */
let runtime: Promise<typeof mapboxgl> | null = null;

export function loadMapboxGl(): Promise<typeof mapboxgl> {
	// The stylesheet rides along with the runtime rather than being imported at
	// the top of `map-canvas`, so it is not requested on routes that never draw
	// a map either.
	runtime ??= Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')]).then(
		([module]) => module.default,
	);
	return runtime;
}
