import { describe, expect, it } from 'vitest';
import {
	currentOrganizationSyncDescriptor,
	decodeShapeColumnName,
	electricShapeCollectionOptions,
	encodeShapeColumnName,
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

	it('defines profiles as selected-organization label sync only', () => {
		expect(profilesSyncDescriptor).toMatchObject({
			id: 'profiles',
			table: 'profiles',
			endpointPath: '/sync/shapes/profiles',
			syncMode: 'eager',
		});
		expect(profilesSyncDescriptor.columns).toEqual([
			'id',
			'organizationId',
			'displayName',
			'isActive',
			'createdAt',
			'updatedAt',
		]);
		expect(profilesSyncDescriptor.columns).not.toContain('email');
		expect(profilesSyncDescriptor.columns).not.toContain('userId');
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
		expect(encodeShapeColumnName('mailingAddressLine1')).toBe('mailing_address_line_1');
		expect(encodeShapeColumnName('mailingAddressLine2')).toBe('mailing_address_line_2');
		expect(decodeShapeColumnName('mailing_address_line_1')).toBe('mailingAddressLine1');
		expect(decodeShapeColumnName('mailing_address_line_2')).toBe('mailingAddressLine2');
	});

	it('keeps foundation lookup catalogs as command-backed tracer descriptors', () => {
		expect(webCommandMutationDescriptors.map((descriptor) => descriptor.id)).toEqual([
			'current_organization',
			'collection_methods',
			'collection_lures',
			'habitat_types',
		]);
	});

	it('keeps the remaining web tracer descriptors read-only', () => {
		expect(webReadOnlyTracerDescriptors.map((descriptor) => descriptor.id)).toEqual([
			'units',
			'profiles',
			'genera',
			'species',
			'organization_species',
			'application_methods',
			'source_reduction_methods',
			'outreach_methods',
			'biocontrol_methods',
			'vehicles',
			'equipment',
			'notification_types',
			'tags',
			'routes',
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
