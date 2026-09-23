import { describe, expect, it } from 'vitest';
import {
	densityRangeKeys,
	ORG_ROLE_OPTIONS,
} from '../../../../components/my-organization/constants';

/**
 * Both lists are derived from the register rather than typed out, and the People
 * page and the larval policy form read each in order.
 */
describe('the organization setup option lists', () => {
	it('climbs the role ladder from viewer', () => {
		expect(ORG_ROLE_OPTIONS).toEqual(['viewer', 'collector', 'manager', 'admin', 'owner']);
	});

	it('offers a range for the four bands above none', () => {
		expect(densityRangeKeys).toEqual(['light', 'medium', 'heavy', 'very_heavy']);
	});
});
