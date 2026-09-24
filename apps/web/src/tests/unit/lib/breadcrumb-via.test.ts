import { describe, expect, it } from 'vitest';
import { breadcrumbPath } from '../../../lib/breadcrumb-via';

const ID = '11111111-1111-4111-8111-111111111111';

describe('breadcrumbPath', () => {
	it('re-roots a record opened from a sibling list under that list', () => {
		expect(
			breadcrumbPath(`/larval-surveillance/habitats/${ID}`, '/larval-surveillance/habitats/table'),
		).toBe(`/larval-surveillance/habitats/table/${ID}`);
	});

	it('leaves the path alone with no origin or an unrelated one', () => {
		const path = `/larval-surveillance/habitats/${ID}`;

		expect(breadcrumbPath(path, undefined)).toBe(path);
		expect(breadcrumbPath(path, '/public-engagement/service-requests/table')).toBe(path);
	});
});
