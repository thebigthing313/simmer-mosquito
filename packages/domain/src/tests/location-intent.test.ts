import { describe, expect, it } from 'vitest';
import {
	validateAdHocInspectionLocationSource,
	validateAdultCollectionLocationSource,
	validateControlActionLocationSource,
	validateHabitatLocationSource,
	validateMissionItemLocationSource,
	validateRequestedControlActionLocationSource,
	validateTrapLocationSource,
} from '../location-intent.js';
import {
	type DomainValidationIssue,
	getOwnedGeometryPolicy,
	OWNED_GEOMETRY_POLICIES,
} from '../shared.js';

const addressId = '11111111-1111-4111-8111-111111111111';
const habitatId = '22222222-2222-4222-8222-222222222222';
const inspectionId = '33333333-3333-4333-8333-333333333333';
const trapId = '44444444-4444-4444-8444-444444444444';
const collectionId = '55555555-5555-4555-8555-555555555555';
const serviceRequestId = '66666666-6666-4666-8666-666666666666';
const requestedControlActionId = '77777777-7777-4777-8777-777777777777';
const missionItemId = '88888888-8888-4888-8888-888888888888';
const pointGeometry = { type: 'Point' as const, coordinates: [-90, 35] as const };

function collectIssues(run: (issues: DomainValidationIssue[]) => unknown): DomainValidationIssue[] {
	const issues: DomainValidationIssue[] = [];
	run(issues);
	return issues;
}

describe('location source flows', () => {
	it('limits trap geometry to manual drawing or address geometry', () => {
		expect(
			validateTrapLocationSource({ kind: 'address', addressId }, 'locationSource', []),
		).toEqual({ kind: 'address', addressId });

		expect(
			collectIssues((issues) =>
				validateTrapLocationSource({ kind: 'habitat', habitatId }, 'locationSource', issues),
			),
		).toContainEqual({
			path: 'locationSource.kind',
			message: 'locationSource.kind is not supported for this location source flow.',
		});
	});

	it('allows adult collection geometry from traps but not habitats', () => {
		expect(
			validateAdultCollectionLocationSource({ kind: 'trap', trapId }, 'locationSource', []),
		).toEqual({ kind: 'trap', trapId });

		expect(
			collectIssues((issues) =>
				validateAdultCollectionLocationSource(
					{ kind: 'habitat', habitatId },
					'locationSource',
					issues,
				),
			),
		).toHaveLength(1);
	});

	it('keeps habitat and ad hoc inspection source flows distinct', () => {
		expect(
			validateHabitatLocationSource({ kind: 'inspection', inspectionId }, 'locationSource', []),
		).toEqual({ kind: 'inspection', inspectionId });

		expect(
			validateAdHocInspectionLocationSource(
				{ kind: 'serviceRequest', serviceRequestId },
				'locationSource',
				[],
			),
		).toEqual({ kind: 'serviceRequest', serviceRequestId });

		expect(
			collectIssues((issues) =>
				validateHabitatLocationSource({ kind: 'trap', trapId }, 'locationSource', issues),
			),
		).toHaveLength(1);
	});

	it('allows requested action geometry from field sources but not mission items', () => {
		expect(
			validateRequestedControlActionLocationSource(
				{ kind: 'collection', collectionId },
				'locationSource',
				[],
			),
		).toEqual({ kind: 'collection', collectionId });

		expect(
			collectIssues((issues) =>
				validateRequestedControlActionLocationSource(
					{ kind: 'missionItem', missionItemId },
					'locationSource',
					issues,
				),
			),
		).toHaveLength(1);
	});

	it('allows mission items to inherit requested action geometry', () => {
		expect(
			validateMissionItemLocationSource(
				{ kind: 'requestedControlAction', requestedControlActionId },
				'locationSource',
				[],
			),
		).toEqual({ kind: 'requestedControlAction', requestedControlActionId });
	});

	it('allows actual control actions to inherit mission item geometry with manual override support elsewhere', () => {
		expect(
			validateControlActionLocationSource(
				{ kind: 'missionItem', missionItemId },
				'locationSource',
				[],
			),
		).toEqual({ kind: 'missionItem', missionItemId });

		expect(
			validateControlActionLocationSource(
				{ kind: 'geometry', geometry: pointGeometry },
				'locationSource',
				[],
			),
		).toEqual({ kind: 'geometry', geometry: pointGeometry });

		expect(
			collectIssues((issues) =>
				validateControlActionLocationSource({ kind: 'trap', trapId }, 'locationSource', issues),
			),
		).toHaveLength(1);
	});
});

describe('owned geometry policies', () => {
	it('records geometry types by domain-owned geometry concept', () => {
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

		expect(getOwnedGeometryPolicy('address').allowedTypes).toEqual(['Point']);
		expect(getOwnedGeometryPolicy('region').allowedTypes).toEqual(['Polygon']);
		expect(getOwnedGeometryPolicy('missionItem').allowedTypes).toEqual([
			'Point',
			'LineString',
			'Polygon',
		]);
	});
});
