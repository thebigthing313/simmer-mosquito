import { describe, expect, it } from 'vitest';
import {
	addressesSyncDescriptor,
	currentOrganizationSyncDescriptor,
	electricShapeCollectionOptions,
	insecticideBatchesSyncDescriptor,
	membershipsSyncDescriptor,
	profilesSyncDescriptor,
	type SyncDescriptor,
	syncShapeDescriptors,
	unitsSyncDescriptor,
} from '../../index.js';

describe('sync descriptors', () => {
	it('defines the units shape', () => {
		expect(unitsSyncDescriptor).toMatchObject({
			id: 'units',
			table: 'units',
			endpointPath: '/sync/shapes/units',
		});
		expect(unitsSyncDescriptor.columns).toEqual([
			'id',
			'code',
			'unitName',
			'abbreviation',
			'unitType',
			'unitSystem',
			'createdAt',
		]);
	});

	it('defines profiles as selected-organization people sync', () => {
		expect(profilesSyncDescriptor).toMatchObject({
			id: 'profiles',
			table: 'profiles',
			endpointPath: '/sync/shapes/profiles',
		});
		expect(profilesSyncDescriptor.columns).toEqual([
			'id',
			'organizationId',
			'userId',
			'displayName',
			'email',
			'isActive',
			'createdAt',
			'updatedAt',
		]);
	});

	it('defines memberships as selected-organization access sync', () => {
		expect(membershipsSyncDescriptor).toMatchObject({
			id: 'memberships',
			table: 'memberships',
			endpointPath: '/sync/shapes/memberships',
		});
		expect(membershipsSyncDescriptor.columns).toEqual([
			'id',
			'organizationId',
			'userId',
			'profileId',
			'role',
			'status',
			'isDefault',
			'invitedEmail',
			'workosInvitationId',
			'createdAt',
			'updatedAt',
		]);
	});

	it('defines the current organization row without subscription fields', () => {
		expect(currentOrganizationSyncDescriptor).toMatchObject({
			id: 'current_organization',
			table: 'organizations',
			endpointPath: '/sync/shapes/organization',
		});
		expect(currentOrganizationSyncDescriptor.columns).toEqual([
			'id',
			'workosOrganizationId',
			'name',
			'slug',
			'mainContactEmail',
			'phoneNumber',
			'mailingCountry',
			'mailingAddressLine1',
			'mailingAddressLine2',
			'mailingLocality',
			'mailingRegion',
			'mailingPostalCode',
			'settings',
			'updatedAt',
			'updatedByProfileId',
		]);
		expect(currentOrganizationSyncDescriptor.columns).not.toContain('subscriptionStatus');
		expect(currentOrganizationSyncDescriptor.columns).not.toContain('billingContactEmail');
	});

	it('creates Electric-backed collection options for descriptor-owned shapes', () => {
		const options = electricShapeCollectionOptions({
			descriptor: unitsSyncDescriptor,
			url: 'https://example.test/sync/shapes/units',
			// The caller's, not the descriptor's: how a table streams is the app's
			// decision, and `apps/web` makes it in `src/sync/sync-modes.ts`.
			syncMode: 'eager',
		});

		expect(options.id).toBe('units');
		expect(options.syncMode).toBe('eager');
		expect(
			options.getKey({
				id: 'unit-1',
				code: 'count',
				unitName: 'Count',
				abbreviation: 'ct',
				unitType: 'count',
				unitSystem: 'si',
				createdAt: '2026-05-14T00:00:00.000Z',
			}),
		).toBe('unit-1');
	});

	it('gives the address book its centroid coordinates', () => {
		expect(addressesSyncDescriptor.columns).toEqual([
			'id',
			'organizationId',
			'lat',
			'lng',
			'displayName',
			'country',
			'addressLine1',
			'addressLine2',
			'locality',
			'region',
			'postalCode',
			'geocoderResponse',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
		]);
	});

	it('scopes insecticide batches to an agency', () => {
		expect(insecticideBatchesSyncDescriptor.columns).toContain('organizationId');
	});

	// Both of these used to walk two hand-maintained arrays that between them
	// restated all fifty-five descriptors — one of which also asserted that order,
	// which was the whole of what it tested. `syncShapeDescriptors` is every
	// descriptor there is, so these now cover tables those lists could omit.
	it('omits server-only geometry columns from every shape', () => {
		// Raw/heavy geometry stays server-only and is served by /map/* endpoints.
		// Trigger-maintained centroid columns (lat, lng, geomType) may sync.
		for (const descriptor of syncShapeDescriptors) {
			expect(descriptor.columns).not.toContain('geom');
			expect(descriptor.columns).not.toContain('geojson');
		}
	});

	it('gives a collection no write handlers unless it is handed some', () => {
		// Whether a table accepts writes is the app's decision, made where the
		// collection is created. A descriptor cannot make a collection writable and
		// never could, which is why the read-only/writable split above was inert.
		for (const descriptor of syncShapeDescriptors) {
			expectReadOnlyCollectionOptions(descriptor as unknown as SyncDescriptor<AnyTestRow>);
		}
	});
});

interface AnyTestRow {
	readonly [key: string]: unknown;
	readonly id: string;
}

function expectReadOnlyCollectionOptions(descriptor: SyncDescriptor<unknown & AnyTestRow>): void {
	const options = electricShapeCollectionOptions({
		descriptor,
		url: `https://example.test${descriptor.endpointPath}`,
		syncMode: 'eager',
	}) as Record<string, unknown>;

	expect(options.onInsert).toBeUndefined();
	expect(options.onUpdate).toBeUndefined();
	expect(options.onDelete).toBeUndefined();
}
