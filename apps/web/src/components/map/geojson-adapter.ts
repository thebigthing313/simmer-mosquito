import type {
	GeoJsonFeature,
	GeoJsonFeatureCollection,
	GeoJsonGeometry,
} from '@simmer-mosquito/mapping';

/**
 * The one place the app's GeoJSON vocabulary is handed to Mapbox's.
 *
 * `packages/mapping` is provider-neutral, so a position below `GeoJsonPosition`
 * is a readonly tuple and every coordinate array above it is readonly too.
 * `@types/geojson`, which arrives transitively through `mapbox-gl`, spells the
 * same values as mutable `number[]`. The two are assignable in neither
 * direction, so a single `as` is rejected with TS2352, and the double cast was
 * the only thing that compiled. That is structural rather than careless, and
 * before this file the workspace paid for it at fourteen call sites.
 *
 * The adapter lives on the app side of the seam rather than in
 * `packages/mapping`, because putting it in the package would give a
 * provider-neutral package a dependency on one provider's types, which is what
 * that package exists to avoid. The app has already named the provider.
 *
 * Nothing here validates. Every conversion reinterprets the same object, and
 * callers rely on that: `useGeoJsonSource` holds `data` in an effect dependency,
 * so a copy would re-add the source on every render. A runtime shape check
 * becomes possible now that one file sees every geometry on its way to the
 * renderer, and #761 is where that lands.
 */

/** GeoJSON in the app's own vocabulary, as `packages/mapping` spells it. */
type MapGeoJson = GeoJsonGeometry | GeoJsonFeature | GeoJsonFeatureCollection;

/**
 * What a map seam accepts: either vocabulary.
 *
 * Both halves are load-bearing. Record surfaces hand down mapping's geometry,
 * read off a synced row and measured by `packages/mapping`. The overlays that
 * compose their own features, the activity cloud and the draw, measure and route
 * sessions among them, build Mapbox shapes for their own reasons and never touch
 * mapping's types.
 *
 * So this widens the seam rather than narrowing it: a prop of this type still
 * does not say which of ADR 0018's six shapes reached it. What changed is that
 * the conversion has one home. Narrowing it is #761.
 */
export type MapSourceGeoJson = MapGeoJson | GeoJSON.GeoJSON;

/**
 * A geometry, feature or collection, in the shape a Mapbox source takes.
 *
 * `readonly` is the whole reason the conversion cannot be a plain assignment:
 * mapping's coordinates are readonly tuples and Mapbox's are mutable arrays, so
 * the two types do not overlap in TypeScript's sense even though every value
 * reaching here satisfies both at runtime.
 */
export function toMapboxGeoJson(value: MapSourceGeoJson): GeoJSON.GeoJSON;
export function toMapboxGeoJson(value: MapSourceGeoJson | null): GeoJSON.GeoJSON | null;
export function toMapboxGeoJson(value: MapSourceGeoJson | null): GeoJSON.GeoJSON | null {
	return value === null ? null : (value as unknown as GeoJSON.GeoJSON);
}

/**
 * One geometry, for a caller assembling a Mapbox feature around it.
 *
 * Separate from {@link toMapboxGeoJson} because `GeoJSON.GeoJSON` widens to
 * include `Feature` and `FeatureCollection`, which a feature's `geometry` field
 * will not take. Same cast, same reason: `readonly`.
 */
export function toMapboxGeometry(geometry: GeoJsonGeometry): GeoJSON.Geometry {
	return geometry as unknown as GeoJSON.Geometry;
}
