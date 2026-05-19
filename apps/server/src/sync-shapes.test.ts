import { describe, expect, it } from 'vitest';
import { buildElectricShapeUrl } from './sync-shapes.js';

describe('buildElectricShapeUrl', () => {
	it('forces server-owned shape params while preserving Electric stream params', () => {
		const url = new URL(
			buildElectricShapeUrl({
				electricUrl: 'http://localhost:3001/v1/shape?replica=full',
				incomingUrl:
					'http://localhost:3000/sync/shapes/units?table=profiles&columns=email&where=true&offset=123&handle=abc&live=true',
				columns: ['id', 'code'],
				table: 'units',
			}),
		);

		expect(url.origin).toBe('http://localhost:3001');
		expect(url.pathname).toBe('/v1/shape');
		expect(url.searchParams.get('replica')).toBe('full');
		expect(url.searchParams.get('offset')).toBe('123');
		expect(url.searchParams.get('handle')).toBe('abc');
		expect(url.searchParams.get('live')).toBe('true');
		expect(url.searchParams.get('table')).toBe('units');
		expect(url.searchParams.get('columns')).toBe('id,code');
		expect(url.searchParams.get('where')).toBeNull();
	});

	it('adds a server-owned where clause for scoped shapes', () => {
		const url = new URL(
			buildElectricShapeUrl({
				electricUrl: 'http://localhost:3001/v1/shape',
				incomingUrl: 'http://localhost:3000/sync/shapes/profiles',
				columns: ['id', 'organization_id', 'display_name'],
				table: 'profiles',
				where: "organization_id = 'org-1' and deleted_at is null",
			}),
		);

		expect(url.searchParams.get('table')).toBe('profiles');
		expect(url.searchParams.get('columns')).toBe('id,organization_id,display_name');
		expect(url.searchParams.get('where')).toBe("organization_id = 'org-1' and deleted_at is null");
	});

	it('supports numbered organization address columns', () => {
		const url = new URL(
			buildElectricShapeUrl({
				electricUrl: 'http://localhost:3001/v1/shape',
				incomingUrl: 'http://localhost:3000/sync/shapes/organization',
				columns: ['id', 'mailing_address_line_1', 'mailing_address_line_2'],
				table: 'organizations',
			}),
		);

		expect(url.searchParams.get('columns')).toBe(
			'id,mailing_address_line_1,mailing_address_line_2',
		);
	});
});
