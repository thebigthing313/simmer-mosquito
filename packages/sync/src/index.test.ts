import { describe, expect, it } from 'vitest';
import { decodeShapeColumnName } from './decode-shape-column-name.js';
import { encodeShapeColumnName } from './encode-shape-column-name.js';
import {
	addressesSyncDescriptor,
	currentOrganizationSyncDescriptor,
	electricShapeCollectionOptions,
	insecticideBatchesSyncDescriptor,
	membershipsSyncDescriptor,
	profilesSyncDescriptor,
	type SyncDescriptor,
	unitsSyncDescriptor,
	webCommandMutationDescriptors,
	webReadOnlyTracerDescriptors,
} from './index.js';

describe('sync descriptors', () => {
	it('defines units as the first eager web sync shape', () => {
		expect(unitsSyncDescriptor).toMatchObject({
			id: 'units',
			table: 'units',
			endpointPath: '/sync/shapes/units',
			syncMode: 'eager',
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
			syncMode: 'eager',
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
			syncMode: 'eager',
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
			syncMode: 'eager',
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

	it('maps numbered address columns between client and Electric column names', () => {
		expect(encodeShapeColumnName('addressLine1')).toBe('address_line_1');
		expect(encodeShapeColumnName('addressLine2')).toBe('address_line_2');
		expect(encodeShapeColumnName('mailingAddressLine1')).toBe('mailing_address_line_1');
		expect(encodeShapeColumnName('mailingAddressLine2')).toBe('mailing_address_line_2');
		expect(decodeShapeColumnName('address_line_1')).toBe('addressLine1');
		expect(decodeShapeColumnName('address_line_2')).toBe('addressLine2');
		expect(decodeShapeColumnName('mailing_address_line_1')).toBe('mailingAddressLine1');
		expect(decodeShapeColumnName('mailing_address_line_2')).toBe('mailingAddressLine2');
	});

	it('leaves all-caps SQL keywords untouched so Electric subset where clauses stay valid', () => {
		// The Electric subset-where compiler emits `= ANY($1)` for inArray filters and
		// re-maps identifier tokens through this encoder; ANY must not become _a_n_y.
		expect(encodeShapeColumnName('ANY')).toBe('ANY');
		expect(encodeShapeColumnName('AND')).toBe('AND');
		expect(encodeShapeColumnName('LIKE')).toBe('LIKE');
	});

	it('keeps foundation lookup catalogs as command-backed tracer descriptors', () => {
		expect(webCommandMutationDescriptors.map((descriptor) => descriptor.id)).toEqual([
			'current_organization',
			'addresses',
			'collection_methods',
			'collection_lures',
			'habitat_types',
			'habitats',
			'tags',
		]);
	});

	it('syncs address book records on demand without generated geometry projections', () => {
		expect(addressesSyncDescriptor.syncMode).toBe('on-demand');
		expect(addressesSyncDescriptor.columns).toEqual([
			'id',
			'organizationId',
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

	it('syncs insecticide batches on demand', () => {
		expect(insecticideBatchesSyncDescriptor.syncMode).toBe('on-demand');
		expect(insecticideBatchesSyncDescriptor.columns).toContain('organizationId');
	});

	it('omits owned-geometry columns from Electric shapes', () => {
		for (const descriptor of [...webCommandMutationDescriptors, ...webReadOnlyTracerDescriptors]) {
			expect(descriptor.columns).not.toContain('geom');
			expect(descriptor.columns).not.toContain('lat');
			expect(descriptor.columns).not.toContain('lng');
			expect(descriptor.columns).not.toContain('geojson');
			expect(descriptor.columns).not.toContain('geomType');
		}
	});

	it('keeps the remaining web tracer descriptors read-only', () => {
		expect(webReadOnlyTracerDescriptors.map((descriptor) => descriptor.id)).toEqual([
			'units',
			'profiles',
			'memberships',
			'genera',
			'species',
			'organization_species',
			'application_methods',
			'source_reduction_methods',
			'outreach_methods',
			'biocontrol_methods',
			'vehicles',
			'equipment',
			'insecticides',
			'insecticide_batches',
			'notification_types',
			'inspections',
			'samples',
			'sample_species',
			'routes',
			'region_folders',
			'regions',
			'traps',
			'collections',
			'collection_species',
			'comments',
			'tag_items',
			'additional_personnel',
			'route_items',
			'assignments',
			'assignment_items',
			'formulations',
			'formulation_insecticides',
			'applications',
			'application_batches',
			'source_reductions',
			'outreach_actions',
			'biocontrol_actions',
			'contacts',
			'service_requests',
			'requested_control_actions',
			'missions',
			'mission_items',
			'notification_registrations',
			'notification_registration_types',
			'mission_notifications',
			'weather_sources',
			'weather_source_subscriptions',
			'weather_summaries',
		]);

		for (const descriptor of webReadOnlyTracerDescriptors) {
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
	}) as Record<string, unknown>;

	expect(options.onInsert).toBeUndefined();
	expect(options.onUpdate).toBeUndefined();
	expect(options.onDelete).toBeUndefined();
}
