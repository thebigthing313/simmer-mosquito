import { describe, expect, it } from 'vitest';
import {
	DomainValidationError,
	getOwnedGeometryBaseTypes,
	getOwnedGeometryPolicy,
	normalizeOwnedGeometry,
	OWNED_GEOMETRY_POLICIES,
	type OwnedGeometryKind,
} from '../../shared.js';

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
