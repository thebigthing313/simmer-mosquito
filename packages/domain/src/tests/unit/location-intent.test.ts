import { describe, expect, it } from 'vitest';
import type {
	AdHocControlActionLocationSource,
	AdHocInspectionLocationSource,
	AdultCollectionLocationSource,
	ControlActionLocationSource,
	HabitatLocationSource,
	MissionItemLocationSource,
	RequestedControlActionLocationSource,
	TrapLocationSource,
} from '../../location-intent.js';
import {
	AD_HOC_INSPECTION_LOCATION_SOURCE_KINDS,
	ADULT_COLLECTION_LOCATION_SOURCE_KINDS,
	CONTROL_ACTION_LOCATION_SOURCE_KINDS,
	HABITAT_LOCATION_SOURCE_KINDS,
	type LocationSource,
	type LocationSourceKind,
	MISSION_ITEM_LOCATION_SOURCE_KINDS,
	REQUESTED_CONTROL_ACTION_LOCATION_SOURCE_KINDS,
	TRAP_LOCATION_SOURCE_KINDS,
	validateAdHocInspectionLocationSource,
	validateAdultCollectionLocationSource,
	validateControlActionLocationSource,
	validateHabitatLocationSource,
	validateMissionItemLocationSource,
	validateRequestedControlActionLocationSource,
	validateTrapLocationSource,
} from '../../location-intent.js';
import {
	type DomainValidationIssue,
	getOwnedGeometryPolicy,
	OWNED_GEOMETRY_POLICIES,
} from '../../shared.js';

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

// The spot checks above take one accepted kind and one rejected kind per flow.
// What the server now relies on is stronger: that these seven lists are the whole
// policy, because the geometry resolver no longer re-checks the kind. So drive the
// assertion off the exported lists and cover every kind, accepted and rejected.

const ALL_KINDS: readonly LocationSourceKind[] = [
	'geometry',
	'address',
	'habitat',
	'inspection',
	'trap',
	'collection',
	'serviceRequest',
	'requestedControlAction',
	'missionItem',
];

/** A well-formed source of each kind, so a rejection can only be about the kind. */
const SOURCE_BY_KIND: { readonly [K in LocationSourceKind]: LocationSource } = {
	geometry: { kind: 'geometry', geometry: pointGeometry },
	address: { kind: 'address', addressId },
	habitat: { kind: 'habitat', habitatId },
	inspection: { kind: 'inspection', inspectionId },
	trap: { kind: 'trap', trapId },
	collection: { kind: 'collection', collectionId },
	serviceRequest: { kind: 'serviceRequest', serviceRequestId },
	requestedControlAction: { kind: 'requestedControlAction', requestedControlActionId },
	missionItem: { kind: 'missionItem', missionItemId },
};

describe('location source whitelists are the whole policy', () => {
	it.each([
		['trap', validateTrapLocationSource, TRAP_LOCATION_SOURCE_KINDS],
		[
			'adult collection',
			validateAdultCollectionLocationSource,
			ADULT_COLLECTION_LOCATION_SOURCE_KINDS,
		],
		['habitat', validateHabitatLocationSource, HABITAT_LOCATION_SOURCE_KINDS],
		[
			'ad hoc inspection',
			validateAdHocInspectionLocationSource,
			AD_HOC_INSPECTION_LOCATION_SOURCE_KINDS,
		],
		[
			'requested control action',
			validateRequestedControlActionLocationSource,
			REQUESTED_CONTROL_ACTION_LOCATION_SOURCE_KINDS,
		],
		['mission item', validateMissionItemLocationSource, MISSION_ITEM_LOCATION_SOURCE_KINDS],
		['control action', validateControlActionLocationSource, CONTROL_ACTION_LOCATION_SOURCE_KINDS],
	])('the %s flow accepts exactly its listed kinds', (_flow, validate, allowedKinds) => {
		const allowed = new Set<string>(allowedKinds);

		for (const kind of ALL_KINDS) {
			const issues = collectIssues((collected) =>
				validate(SOURCE_BY_KIND[kind], 'locationSource', collected),
			);

			if (allowed.has(kind)) {
				expect(issues, `${kind} should be accepted`).toEqual([]);
			} else {
				expect(issues, `${kind} should be rejected`).toContainEqual({
					path: 'locationSource.kind',
					message: 'locationSource.kind is not supported for this location source flow.',
				});
			}
		}
	});

	it('lists no kind that is not a location source', () => {
		const listed = new Set<string>([
			...TRAP_LOCATION_SOURCE_KINDS,
			...ADULT_COLLECTION_LOCATION_SOURCE_KINDS,
			...HABITAT_LOCATION_SOURCE_KINDS,
			...AD_HOC_INSPECTION_LOCATION_SOURCE_KINDS,
			...REQUESTED_CONTROL_ACTION_LOCATION_SOURCE_KINDS,
			...MISSION_ITEM_LOCATION_SOURCE_KINDS,
			...CONTROL_ACTION_LOCATION_SOURCE_KINDS,
		]);

		expect([...listed].sort()).toEqual([...ALL_KINDS].sort());
	});
});

// The server's resolver switches over `LocationSource`. Every per-workflow union
// has to be assignable to it, or a handler could hold a source the resolver has no
// arm for — the property the four hand-written resolvers never had.
type AssignableToLocationSource<T extends LocationSource> = T;
type _PerWorkflowUnionsNarrowLocationSource =
	| AssignableToLocationSource<TrapLocationSource>
	| AssignableToLocationSource<AdultCollectionLocationSource>
	| AssignableToLocationSource<HabitatLocationSource>
	| AssignableToLocationSource<AdHocInspectionLocationSource>
	| AssignableToLocationSource<RequestedControlActionLocationSource>
	| AssignableToLocationSource<MissionItemLocationSource>
	| AssignableToLocationSource<AdHocControlActionLocationSource>
	| AssignableToLocationSource<ControlActionLocationSource>;

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
