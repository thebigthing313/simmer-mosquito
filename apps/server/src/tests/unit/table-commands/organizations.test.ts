/**
 * The organization's details, as the body a client sends.
 *
 * The map centre is the case worth testing here (#1413). It is the first pair of
 * numbers on a table whose other details are text, so a body naming either
 * coordinate has to reach the builder as a number, and a value that is not one
 * has to be refused by name rather than read as absent and dropped.
 */

import type { DomainValidationError, IdentityCommand } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import { organizationTableCommands } from '../../../table-commands/organizations.js';
import { ORGANIZATION, organizationHarness } from './command-harness.js';

const { request, build } = organizationHarness({ role: 'owner', id: ORGANIZATION });

const organizations = organizationTableCommands(undefined as never);

function changesOf(payload: Record<string, unknown>): object {
	const command = build(
		organizations,
		'identity.updateOrganizationDetails',
		request(payload),
	) as Extract<IdentityCommand, { type: 'identity.updateOrganizationDetails' }>;
	return command.payload.changes;
}

function refusedPaths(payload: Record<string, unknown>): readonly string[] {
	try {
		changesOf(payload);
	} catch (error) {
		return (error as DomainValidationError).issues.map((issue) => issue.path);
	}
	return [];
}

describe('organizations intent map', () => {
	it('reads a map centre off its two columns', () => {
		expect(changesOf({ map_center_lat: 40.4316, map_center_lng: -74.4331 })).toEqual({
			mapCenterLat: 40.4316,
			mapCenterLng: -74.4331,
		});
	});

	it('carries the centre beside the address it was geocoded from', () => {
		expect(
			changesOf({
				mailing_postal_code: '08901',
				map_center_lat: 40.4862,
				map_center_lng: -74.4518,
			}),
		).toEqual({ mailingPostalCode: '08901', mapCenterLat: 40.4862, mapCenterLng: -74.4518 });
	});

	it('leaves the centre out of a write that did not name it', () => {
		expect(changesOf({ phone_number: '555-0100' })).not.toHaveProperty('mapCenterLat');
	});

	it.each([
		['a latitude above 90', { map_center_lat: 91, map_center_lng: 0 }, 'mapCenterLat'],
		['a latitude below -90', { map_center_lat: -90.5, map_center_lng: 0 }, 'mapCenterLat'],
		['a longitude above 180', { map_center_lat: 0, map_center_lng: 181 }, 'mapCenterLng'],
		['a longitude below -180', { map_center_lat: 0, map_center_lng: -180.5 }, 'mapCenterLng'],
		['a latitude sent as a string', { map_center_lat: '40', map_center_lng: 0 }, 'mapCenterLat'],
		['half a centre cleared', { map_center_lat: null }, 'mapCenterLat'],
	])('refuses %s by name', (_label, payload, path) => {
		expect(refusedPaths(payload)).toContain(path);
	});
});
