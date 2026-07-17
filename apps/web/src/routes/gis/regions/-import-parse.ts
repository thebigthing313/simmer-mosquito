/**
 * Client-side parsing of region boundaries from an uploaded KML or GeoJSON file.
 * Everything here is dependency-free: GeoJSON via `JSON.parse`, KML via the
 * browser's built-in `DOMParser`. Multi-polygon geometries are flattened into one
 * region per polygon; non-polygon geometries are skipped and counted.
 *
 * The pure helpers (`flattenPolygons`, `parseKmlCoordinates`, `parseGeoJson`) carry
 * the parsing logic and are unit-tested; only the top-level KML path touches the DOM.
 */

export type Position = [number, number];

export interface ImportPolygon {
	readonly type: 'Polygon';
	readonly coordinates: Position[][];
}

export interface ParsedRegion {
	readonly name: string;
	readonly geometry: ImportPolygon;
}

export interface ParseResult {
	readonly regions: ParsedRegion[];
	/** Non-polygon geometries (points, lines, empties) that were ignored. */
	readonly skipped: number;
	/** Set when the file could not be parsed at all. */
	readonly error?: string;
}

/** A source geometry paired with an optional name from its Feature/Placemark. */
interface NamedGeometry {
	readonly name: string | null;
	readonly polygons: ImportPolygon[];
	/** True when the source geometry existed but yielded no polygons (skip it). */
	readonly nonPolygon: boolean;
}

export function parseRegionsFromFile(text: string, fileName: string): ParseResult {
	const looksKml = /\.kml$/i.test(fileName) || text.trimStart().startsWith('<');
	try {
		return looksKml ? parseKml(text) : parseGeoJson(text);
	} catch (error) {
		return {
			regions: [],
			skipped: 0,
			error: error instanceof Error ? error.message : 'Unable to parse the file.',
		};
	}
}

// ---------------------------------------------------------------------------
// GeoJSON
// ---------------------------------------------------------------------------

export function parseGeoJson(text: string): ParseResult {
	const data = JSON.parse(text) as unknown;
	return finalize(collectGeoJson(data));
}

function collectGeoJson(node: unknown): NamedGeometry[] {
	if (!isRecord(node) || typeof node.type !== 'string') {
		return [];
	}
	if (node.type === 'FeatureCollection' && Array.isArray(node.features)) {
		return node.features.flatMap((feature) => collectGeoJson(feature));
	}
	if (node.type === 'Feature') {
		const name = readGeoJsonName(node.properties);
		const polygons = flattenPolygons(node.geometry);
		return [{ name, polygons, nonPolygon: polygons.length === 0 }];
	}
	// A bare geometry object.
	const polygons = flattenPolygons(node);
	return [{ name: null, polygons, nonPolygon: polygons.length === 0 }];
}

function readGeoJsonName(properties: unknown): string | null {
	if (!isRecord(properties)) {
		return null;
	}
	for (const key of ['name', 'Name', 'NAME', 'title', 'label']) {
		const value = properties[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
}

/**
 * Flatten any GeoJSON geometry into a list of Polygons. MultiPolygons split into
 * their member polygons; GeometryCollections recurse; non-areal geometries yield
 * nothing.
 */
export function flattenPolygons(geometry: unknown): ImportPolygon[] {
	if (!isRecord(geometry) || typeof geometry.type !== 'string') {
		return [];
	}
	if (geometry.type === 'Polygon') {
		const rings = normalizeRings(geometry.coordinates);
		return rings === null ? [] : [{ type: 'Polygon', coordinates: rings }];
	}
	if (geometry.type === 'MultiPolygon') {
		if (!Array.isArray(geometry.coordinates)) {
			return [];
		}
		return geometry.coordinates
			.map((polygon) => normalizeRings(polygon))
			.filter((rings): rings is Position[][] => rings !== null)
			.map((rings) => ({ type: 'Polygon', coordinates: rings }));
	}
	if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
		return geometry.geometries.flatMap((child) => flattenPolygons(child));
	}
	return [];
}

/** Coerce raw coordinate arrays into `[ring, ...holes]` of `[lng, lat]` pairs. */
function normalizeRings(coordinates: unknown): Position[][] | null {
	if (!Array.isArray(coordinates)) {
		return null;
	}
	const rings: Position[][] = [];
	for (const ring of coordinates) {
		if (!Array.isArray(ring)) {
			return null;
		}
		const positions: Position[] = [];
		for (const point of ring) {
			if (
				!Array.isArray(point) ||
				typeof point[0] !== 'number' ||
				typeof point[1] !== 'number' ||
				!Number.isFinite(point[0]) ||
				!Number.isFinite(point[1])
			) {
				return null;
			}
			positions.push([point[0], point[1]]);
		}
		if (positions.length >= 4) {
			rings.push(positions);
		}
	}
	return rings.length === 0 ? null : rings;
}

// ---------------------------------------------------------------------------
// KML
// ---------------------------------------------------------------------------

export function parseKml(text: string): ParseResult {
	if (typeof DOMParser === 'undefined') {
		throw new Error('KML parsing is only available in the browser.');
	}
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('The file is not valid KML/XML.');
	}

	const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
	const named: NamedGeometry[] = placemarks.map((placemark) => {
		const name = kmlPlacemarkName(placemark);
		const polygons = kmlPolygonsFromElement(placemark);
		return { name, polygons, nonPolygon: polygons.length === 0 };
	});

	// KML can also carry loose <Polygon> outside a Placemark; include any not already
	// captured under a placemark by falling back to a document-wide scan when empty.
	if (named.length === 0) {
		const polygons = kmlPolygonsFromElement(doc.documentElement);
		if (polygons.length > 0) {
			named.push({ name: null, polygons, nonPolygon: false });
		}
	}

	return finalize(named);
}

function kmlPlacemarkName(placemark: Element): string | null {
	for (const child of Array.from(placemark.children)) {
		if (child.tagName === 'name') {
			const text = child.textContent?.trim() ?? '';
			return text.length === 0 ? null : text;
		}
	}
	return null;
}

function kmlPolygonsFromElement(element: Element): ImportPolygon[] {
	const polygonNodes = Array.from(element.getElementsByTagName('Polygon'));
	const polygons: ImportPolygon[] = [];
	for (const polygonNode of polygonNodes) {
		const outer = firstRingCoordinates(polygonNode, 'outerBoundaryIs');
		if (outer === null) {
			continue;
		}
		const rings: Position[][] = [outer];
		for (const inner of allRingCoordinates(polygonNode, 'innerBoundaryIs')) {
			rings.push(inner);
		}
		polygons.push({ type: 'Polygon', coordinates: rings });
	}
	return polygons;
}

function firstRingCoordinates(polygon: Element, boundaryTag: string): Position[] | null {
	const boundary = Array.from(polygon.getElementsByTagName(boundaryTag))[0];
	if (boundary === undefined) {
		return null;
	}
	const coordinates = Array.from(boundary.getElementsByTagName('coordinates'))[0];
	if (coordinates === undefined) {
		return null;
	}
	const ring = parseKmlCoordinates(coordinates.textContent ?? '');
	return ring.length >= 4 ? ring : null;
}

function allRingCoordinates(polygon: Element, boundaryTag: string): Position[][] {
	const rings: Position[][] = [];
	for (const boundary of Array.from(polygon.getElementsByTagName(boundaryTag))) {
		const coordinates = Array.from(boundary.getElementsByTagName('coordinates'))[0];
		if (coordinates === undefined) {
			continue;
		}
		const ring = parseKmlCoordinates(coordinates.textContent ?? '');
		if (ring.length >= 4) {
			rings.push(ring);
		}
	}
	return rings;
}

/**
 * Parse a KML `<coordinates>` blob — whitespace-separated `lon,lat[,alt]` tuples —
 * into `[lng, lat]` positions. Altitude is dropped.
 */
export function parseKmlCoordinates(text: string): Position[] {
	const positions: Position[] = [];
	for (const token of text.trim().split(/\s+/)) {
		if (token.length === 0) {
			continue;
		}
		const parts = token.split(',');
		const lng = Number.parseFloat(parts[0] ?? '');
		const lat = Number.parseFloat(parts[1] ?? '');
		if (Number.isFinite(lng) && Number.isFinite(lat)) {
			positions.push([lng, lat]);
		}
	}
	return positions;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function finalize(named: readonly NamedGeometry[]): ParseResult {
	const regions: ParsedRegion[] = [];
	let skipped = 0;

	for (const entry of named) {
		if (entry.polygons.length === 0) {
			if (entry.nonPolygon) {
				skipped += 1;
			}
			continue;
		}
		entry.polygons.forEach((geometry, index) => {
			const base = entry.name ?? `Region ${regions.length + 1}`;
			const name = entry.polygons.length > 1 ? `${base} (${index + 1})` : base;
			regions.push({ name, geometry });
		});
	}

	return { regions, skipped };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
