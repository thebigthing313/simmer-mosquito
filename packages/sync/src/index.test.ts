import { describe, expect, it } from 'vitest';
import {
	electricShapeCollectionOptions,
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

	it('keeps foundation lookup catalogs as command-backed tracer descriptors', () => {
		expect(webCommandMutationDescriptors.map((descriptor) => descriptor.id)).toEqual([
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
