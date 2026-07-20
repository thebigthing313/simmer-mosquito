/**
 * Client-side parsing of region boundaries from an uploaded KML or GeoJSON file.
 * Everything here is dependency-free: GeoJSON via `JSON.parse`, KML via the
 * browser's built-in `DOMParser`. Multi-polygon geometries are flattened into one
 * region per polygon; non-polygon geometries are skipped and counted.
 *
 * The pure helpers (`flattenPolygons`, `parseKmlCoordinates`, `parseGeoJson`) carry
 * the parsing logic and are unit-tested; only the top-level KML path touches the DOM.
 * KML is walked recursively — Placemarks and Polygons are found at any nesting depth,
 * not just one level down — and the whole import is capped at `MAX_POLYGONS` polygons.
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
	/** True when the file held more than `MAX_POLYGONS` and only the first were kept. */
	readonly truncated: boolean;
	/** Set when the file could not be parsed at all. */
	readonly error?: string;
}

/** Hard cap on how many polygons a single import may contribute. */
export const MAX_POLYGONS = 1000;

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
			truncated: false,
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
	const doc = parseKmlDocument(text);
	const named: NamedGeometry[] = [];
	collectKmlGeometries(doc.documentElement, named);
	return finalize(named);
}

/**
 * Parse KML into a DOM. Strict `application/xml` parsing is tried first; if it fails,
 * we attempt one repair pass for the most common real-world defect — namespace
 * prefixes (e.g. `xsi:`) used without a matching `xmlns:` declaration, which some
 * exports (ArcGIS, older Google tools) emit and which is not namespace-well-formed.
 */
function parseKmlDocument(text: string): Document {
	const parser = new DOMParser();
	const doc = parser.parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length === 0) {
		return doc;
	}
	const repaired = declareMissingNamespaces(text);
	if (repaired !== null) {
		const retry = parser.parseFromString(repaired, 'application/xml');
		if (retry.getElementsByTagName('parsererror').length === 0) {
			return retry;
		}
	}
	throw new Error('The file is not valid KML/XML.');
}

/**
 * Find namespace prefixes that are used (`prefix:local` on an element or attribute)
 * but never declared (`xmlns:prefix=...`), and declare each on the root element so a
 * strict XML re-parse succeeds. Returns null when nothing is missing (no repair to try).
 * Declarations are only added, never removed, so the result is always well-formed.
 */
export function declareMissingNamespaces(text: string): string | null {
	const declared = new Set<string>();
	for (const match of text.matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=/g)) {
		declared.add(match[1] as string);
	}
	const missing = new Set<string>();
	// A prefix used in markup is preceded by `<` (element) or whitespace (attribute).
	// The leading `[<\s]` avoids matching URL schemes inside quoted values (`"http:...`).
	for (const match of text.matchAll(/[<\s]([A-Za-z_][\w.-]*):[A-Za-z_]/g)) {
		const prefix = match[1] as string;
		if (prefix !== 'xml' && prefix !== 'xmlns' && !declared.has(prefix)) {
			missing.add(prefix);
		}
	}
	if (missing.size === 0) {
		return null;
	}
	// Inject the declarations into the first element's open tag (the root); the
	// alternation lets attribute values that contain `>` be skipped safely.
	const rootOpen = /<[A-Za-z_][\w.-]*(?:[^>"']|"[^"]*"|'[^']*')*>/.exec(text);
	if (rootOpen === null) {
		return null;
	}
	const decls = [...missing]
		.map((prefix) => ` xmlns:${prefix}="urn:x-simmer-import:${prefix}"`)
		.join('');
	const openTag = rootOpen[0];
	const patchedTag = `${openTag.slice(0, -1)}${decls}>`;
	return text.slice(0, rootOpen.index) + patchedTag + text.slice(rootOpen.index + openTag.length);
}

/**
 * Walk the KML tree to whatever depth Placemarks and Polygons live at. KML nests
 * geometry under arbitrary `<Document>`/`<Folder>` levels and inside
 * `<MultiGeometry>`, so we never assume a fixed depth:
 *  - A `<Placemark>` is one grouping unit: every `<Polygon>` beneath it (including
 *    inside a MultiGeometry) becomes one named entry, and we stop descending.
 *  - A loose `<Polygon>` outside any Placemark becomes its own unnamed entry.
 *  - Any other element is descended into so deeper Placemarks/Polygons are found.
 */
function collectKmlGeometries(element: Element, out: NamedGeometry[]): void {
	for (const child of Array.from(element.children)) {
		if (child.tagName === 'Placemark') {
			const polygons = kmlPolygonsWithin(child);
			out.push({ name: kmlPlacemarkName(child), polygons, nonPolygon: polygons.length === 0 });
		} else if (child.tagName === 'Polygon') {
			const polygon = kmlPolygonFromNode(child);
			out.push({
				name: null,
				polygons: polygon === null ? [] : [polygon],
				nonPolygon: polygon === null,
			});
		} else {
			collectKmlGeometries(child, out);
		}
	}
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

/** Collect every `<Polygon>` descendant of an element (e.g. a Placemark's geometry). */
function kmlPolygonsWithin(element: Element): ImportPolygon[] {
	const polygons: ImportPolygon[] = [];
	for (const polygonNode of Array.from(element.getElementsByTagName('Polygon'))) {
		const polygon = kmlPolygonFromNode(polygonNode);
		if (polygon !== null) {
			polygons.push(polygon);
		}
	}
	return polygons;
}

/** Turn a single `<Polygon>` element into an ImportPolygon, or null if it has no valid ring. */
function kmlPolygonFromNode(polygonNode: Element): ImportPolygon | null {
	const outer = firstRingCoordinates(polygonNode, 'outerBoundaryIs');
	if (outer === null) {
		return null;
	}
	const rings: Position[][] = [outer];
	for (const inner of allRingCoordinates(polygonNode, 'innerBoundaryIs')) {
		rings.push(inner);
	}
	return { type: 'Polygon', coordinates: rings };
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
	let truncated = false;

	for (const entry of named) {
		if (entry.polygons.length === 0) {
			if (entry.nonPolygon) {
				skipped += 1;
			}
			continue;
		}
		for (let index = 0; index < entry.polygons.length; index += 1) {
			if (regions.length >= MAX_POLYGONS) {
				// More polygons remain in the file; keep only the first MAX_POLYGONS.
				truncated = true;
				break;
			}
			const base = entry.name ?? `Region ${regions.length + 1}`;
			const name = entry.polygons.length > 1 ? `${base} (${index + 1})` : base;
			regions.push({ name, geometry: entry.polygons[index] as ImportPolygon });
		}
		if (truncated) {
			break;
		}
	}

	return { regions, skipped, truncated };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
