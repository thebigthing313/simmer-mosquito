import { describe, expect, it } from 'vitest';
import {
	DomainValidationError,
	type DomainValidationIssue,
	geometryCoversGround,
	getOwnedGeometryBaseTypes,
	getOwnedGeometryPolicy,
	normalizeOwnedGeometry,
	OWNED_GEOMETRY_POLICIES,
	type OwnedGeometryKind,
	SUPPORTED_GEOMETRY_TYPES,
	type SupportedGeoJsonGeometry,
	validateGeometry,
} from '../../shared.js';

/** A square with area 4, in degrees. */
const SQUARE = [
	[0, 0],
	[0, 2],
	[2, 2],
	[2, 0],
	[0, 0],
];
/** A square with area 1, sitting inside {@link SQUARE}. */
const HOLE = [
	[0.5, 0.5],
	[0.5, 1.5],
	[1.5, 1.5],
	[1.5, 0.5],
	[0.5, 0.5],
];
/** Four positions, all the same. Closed, four-position, and zero area. */
const PINPRICK = [
	[3, 3],
	[3, 3],
	[3, 3],
	[3, 3],
];

function build(input: unknown): {
	readonly geometry: SupportedGeoJsonGeometry;
	readonly issues: readonly DomainValidationIssue[];
} {
	const issues: DomainValidationIssue[] = [];
	const geometry = validateGeometry(input, SUPPORTED_GEOMETRY_TYPES, 'geometry', issues);
	return { geometry, issues };
}

describe('the owned geometry register', () => {
	it('names every kind exactly once, in domain order', () => {
		expect(OWNED_GEOMETRY_POLICIES.map((policy) => policy.kind)).toEqual([
			'address',
			'region',
			'trap',
			'collection',
			'habitat',
			'inspection',
			'controlAction',
			'requestedControlAction',
			'missionItem',
			'serviceRequest',
			'notificationRegistration',
			'weatherStation',
		]);
	});

	it('covers the fifteen geometry tables, each on one row', () => {
		const tables = OWNED_GEOMETRY_POLICIES.flatMap((policy) => policy.tables);

		expect(tables).toHaveLength(15);
		expect(new Set(tables).size).toBe(15);
		expect(getOwnedGeometryPolicy('controlAction').tables).toEqual([
			'applications',
			'source_reductions',
			'outreach_actions',
			'biocontrol_actions',
		]);
	});

	it('stores the shape set the matrix says', () => {
		expect(getOwnedGeometryPolicy('address').allowedTypes).toEqual(['Point']);
		expect(getOwnedGeometryPolicy('region').allowedTypes).toEqual(['Polygon']);
		expect(getOwnedGeometryPolicy('missionItem').allowedTypes).toEqual([
			'Point',
			'LineString',
			'Polygon',
		]);
	});

	it('refuses a kind it does not hold', () => {
		expect(() => getOwnedGeometryPolicy('parcel' as OwnedGeometryKind)).toThrow(
			'Unknown owned geometry kind: parcel',
		);
	});
});

describe('getOwnedGeometryBaseTypes', () => {
	it('normalizes the storable set to the shapes a user draws', () => {
		expect(getOwnedGeometryBaseTypes('weatherStation')).toEqual(['Point']);
		expect(getOwnedGeometryBaseTypes('habitat')).toEqual(['Point', 'LineString', 'Polygon']);
	});

	it('answers for every kind the register holds', () => {
		for (const policy of OWNED_GEOMETRY_POLICIES) {
			const bases = getOwnedGeometryBaseTypes(policy.kind);

			expect(bases.length).toBeGreaterThan(0);
			expect(new Set(bases).size).toBe(bases.length);
		}
	});
});

describe('normalizeOwnedGeometry', () => {
	it('accepts a shape the kind may store', () => {
		expect(normalizeOwnedGeometry('trap', { type: 'Point', coordinates: [-90.1, 35.7] })).toEqual({
			type: 'Point',
			coordinates: [-90.1, 35.7],
		});
	});

	it('refuses a shape the kind may not store', () => {
		expect(() =>
			normalizeOwnedGeometry('trap', {
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[0, 1],
						[1, 1],
						[0, 0],
					],
				],
			}),
		).toThrow(DomainValidationError);
	});

	it('names the path it was given', () => {
		expect(() => normalizeOwnedGeometry('region', { type: 'Point' }, 'location.geometry')).toThrow(
			DomainValidationError,
		);
	});
});

describe('validateGeometry over six shapes', () => {
	it('takes each of the six', () => {
		const accepted = [
			{ type: 'Point', coordinates: [1, 1] },
			{ type: 'LineString', coordinates: [SQUARE[0], SQUARE[1]] },
			{ type: 'Polygon', coordinates: [SQUARE] },
			{
				type: 'MultiPoint',
				coordinates: [
					[1, 1],
					[2, 2],
				],
			},
			{ type: 'MultiLineString', coordinates: [[SQUARE[0], SQUARE[1]], SQUARE] },
			{ type: 'MultiPolygon', coordinates: [[SQUARE], [HOLE]] },
		];

		for (const input of accepted) {
			const { geometry, issues } = build(input);

			expect(issues, JSON.stringify(input.type)).toEqual([]);
			expect(geometry.type).toBe(input.type);
		}
	});

	it('validates each part with the validator for its base shape', () => {
		// A ring that is not closed, in the second part. Nothing about the multi
		// validators is a reimplementation, so ring closure reaches part 1 for free.
		const { issues } = build({
			type: 'MultiPolygon',
			coordinates: [[SQUARE], [[HOLE[0], HOLE[1], HOLE[2], HOLE[3]]]],
		});

		expect(issues).toEqual([
			{
				path: 'geometry.coordinates.1.0',
				message: 'geometry.coordinates.1.0 must be closed with matching first and last positions.',
			},
		]);
	});

	it('refuses a multi shape with no parts, having nothing to demote to', () => {
		const { issues } = build({ type: 'MultiPolygon', coordinates: [] });

		expect(issues).toEqual([
			{
				path: 'geometry.coordinates',
				message: 'geometry.coordinates must include at least one part.',
			},
		]);
	});
});

describe('demote', () => {
	it('rewrites a one-part multi shape to its base shape', () => {
		const table = [
			{ input: { type: 'MultiPoint', coordinates: [[1, 1]] }, stored: 'Point' },
			{
				input: { type: 'MultiLineString', coordinates: [[SQUARE[0], SQUARE[1]]] },
				stored: 'LineString',
			},
			{ input: { type: 'MultiPolygon', coordinates: [[SQUARE]] }, stored: 'Polygon' },
		];

		for (const { input, stored } of table) {
			const { geometry, issues } = build(input);

			expect(issues, input.type).toEqual([]);
			expect(geometry.type, input.type).toBe(stored);
		}
	});

	it('unwraps the part rather than keeping the wrapper', () => {
		const { geometry } = build({ type: 'MultiPolygon', coordinates: [[SQUARE]] });

		expect(geometry).toEqual({ type: 'Polygon', coordinates: [SQUARE] });
	});

	it('leaves a two-part multi shape alone', () => {
		const { geometry } = build({ type: 'MultiPolygon', coordinates: [[SQUARE], [HOLE]] });

		expect(geometry.type).toBe('MultiPolygon');
	});

	/**
	 * Demote runs before the policy test, so `allowedTypes` is asked about the
	 * shape that lands in the column. This is the `ogr2ogr` case: a single-lot
	 * shapefile feature arrives as a one-part MultiPolygon and stores as a Polygon.
	 */
	it('lets a Polygon-only kind take a one-part MultiPolygon, and refuses a two-part one', () => {
		expect(
			normalizeOwnedGeometry('region', { type: 'MultiPolygon', coordinates: [[SQUARE]] }),
		).toEqual({ type: 'Polygon', coordinates: [SQUARE] });
		expect(() =>
			normalizeOwnedGeometry('region', { type: 'MultiPolygon', coordinates: [[SQUARE], [HOLE]] }),
		).toThrow(DomainValidationError);
	});

	it('names the payload rather than the demoted shape when a part is bad', () => {
		const { issues } = build({ type: 'MultiPolygon', coordinates: [[PINPRICK]] });

		expect(issues).toEqual([
			{ path: 'geometry.coordinates.0', message: 'geometry.coordinates.0 covers no ground.' },
		]);
	});
});

describe('covering ground', () => {
	it('refuses a ring that encloses nothing', () => {
		const degenerate = [
			{ what: 'four positions in one spot', rings: [PINPRICK] },
			{
				what: 'three collinear corners',
				rings: [
					[
						[0, 0],
						[1, 1],
						[2, 2],
						[0, 0],
					],
				],
			},
			{ what: 'a hole the size of its outer ring', rings: [SQUARE, SQUARE] },
		];

		for (const { what, rings } of degenerate) {
			const { issues } = build({ type: 'Polygon', coordinates: rings });

			expect(issues, what).toEqual([
				{ path: 'geometry.coordinates', message: 'geometry.coordinates covers no ground.' },
			]);
		}
	});

	it('counts the outer ring less its holes', () => {
		const { issues } = build({ type: 'Polygon', coordinates: [SQUARE, HOLE] });

		expect(issues).toEqual([]);
	});

	it('refuses a line whose positions all coincide', () => {
		const { issues } = build({
			type: 'LineString',
			coordinates: [
				[4, 4],
				[4, 4],
				[4, 4],
			],
		});

		expect(issues).toEqual([
			{ path: 'geometry.coordinates', message: 'geometry.coordinates covers no ground.' },
		]);
	});

	it('exempts the point shapes, which have no measure', () => {
		expect(build({ type: 'Point', coordinates: [0, 0] }).issues).toEqual([]);
		expect(
			build({
				type: 'MultiPoint',
				coordinates: [
					[5, 5],
					[5, 5],
				],
			}).issues,
		).toEqual([]);
	});

	/**
	 * The whole write, and never the part. Dropping the part would throw away
	 * something the user drew, and it cascades: a two-part multi that loses a part
	 * then demotes, so one silent normalization triggers another.
	 */
	it('refuses the whole multi shape and names the offending part', () => {
		const { issues } = build({ type: 'MultiPolygon', coordinates: [[SQUARE], [PINPRICK]] });

		expect(issues).toEqual([
			{ path: 'geometry.coordinates.1', message: 'geometry.coordinates.1 covers no ground.' },
		]);
	});

	it('says it once, not on top of a structural complaint', () => {
		const { issues } = build({
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[0, 1],
					[1, 1],
				],
			],
		});

		expect(issues).toEqual([
			{
				path: 'geometry.coordinates.0',
				message: 'geometry.coordinates.0 must include at least four positions.',
			},
		]);
	});

	/**
	 * It is the backstop in `geojsonToGeom` as well as the rule in the builder, so
	 * a value it cannot read is not its refusal to make.
	 */
	it('passes anything it cannot read as one of the six shapes', () => {
		expect(geometryCoversGround(null)).toBe(true);
		expect(geometryCoversGround({ type: 'GeometryCollection', geometries: [] })).toBe(true);
		expect(geometryCoversGround({ type: 'Polygon' })).toBe(true);
	});
});
