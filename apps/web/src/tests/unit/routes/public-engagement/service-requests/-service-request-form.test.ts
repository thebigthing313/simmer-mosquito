/** @vitest-environment jsdom */

/**
 * Which placed shapes the service request form hands on to the write seam.
 *
 * The create route used to ask whether what came back was a `Point`. That is the
 * right answer today and only by coincidence: it agrees with the register
 * because `serviceRequest` is point-only, not because anything holds the two
 * together. The Region routes asked the same question about a `Polygon` and
 * refused a boundary that was on the map the day a Region could be multipart.
 *
 * So the predicate reads `allowedTypes` off the register, and these are the
 * answers that matter: a point passes, nothing else does, and the set it reads
 * is the request policy rather than a name written here.
 */

import { getOwnedGeometryPolicy } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { DrawGeometry } from '../../../../../components/map/use-map-draw';
import { defaultContactFormValues } from '../../../../../routes/public-engagement/-contact-fields';
import {
	isRequestLocation,
	type ServiceRequestFormValues,
	validateServiceRequest,
} from '../../../../../routes/public-engagement/service-requests/-service-request-form';

const RING = [
	[-74.4, 40.5],
	[-74.3, 40.5],
	[-74.3, 40.6],
	[-74.4, 40.5],
] as const;

const POINT: DrawGeometry = { type: 'Point', coordinates: [-74.35, 40.55] };
const LINE: DrawGeometry = { type: 'LineString', coordinates: [...RING] };
const POLYGON: DrawGeometry = { type: 'Polygon', coordinates: [RING] };
const MULTIPOLYGON: DrawGeometry = { type: 'MultiPolygon', coordinates: [[RING]] };

describe('isRequestLocation', () => {
	it('takes the point a request is placed at', () => {
		expect(isRequestLocation(POINT)).toBe(true);
	});

	it('refuses the shapes a request cannot store', () => {
		expect(isRequestLocation(LINE)).toBe(false);
		expect(isRequestLocation(POLYGON)).toBe(false);
		expect(isRequestLocation(MULTIPOLYGON)).toBe(false);
	});

	it('answers from the register rather than a shape name', () => {
		// The point of the predicate. Widening the policy has to widen this, and a
		// hand-written 'Point' would leave the create route behind the day it moves.
		expect(getOwnedGeometryPolicy('serviceRequest').allowedTypes).toEqual(['Point']);
	});
});

/**
 * Where a refused service request save puts its message.
 *
 * The create path ran the domain builder and the edit path ran nothing, because
 * the builder requires a point the edit page does not own. Both ran a
 * hand-rolled `validate()` that threw a bare string into the page alert, and on
 * edit that was the only channel there was. The builder now runs on both, with
 * the stand-in point standing in for the one the edit page never shows.
 */
describe('a service request the domain refuses', () => {
	const CONTACT = '44444444-4444-4444-8444-444444444444';
	const ADDRESS = '55555555-5555-4555-8555-555555555555';
	const CREATE = { hideLocation: false, disableNewContact: false };
	const EDIT = { hideLocation: true, disableNewContact: true };

	function values(overrides: Partial<ServiceRequestFormValues> = {}): ServiceRequestFormValues {
		return {
			intakeType: 'phone',
			requestDate: '2026-08-12',
			details: 'Standing water behind the strip mall.',
			receivedByProfileId: '',
			contactMode: 'existing',
			contactId: CONTACT,
			newContact: defaultContactFormValues(),
			addressId: ADDRESS,
			...overrides,
		};
	}

	it('passes a complete request', () => {
		expect(validateServiceRequest(values(), POINT, CREATE)).toBeUndefined();
	});

	it('names missing details on the details field', () => {
		const result = validateServiceRequest(values({ details: '   ' }), POINT, CREATE);

		expect(result?.fields?.details).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names a missing contact on the contact field', () => {
		const result = validateServiceRequest(values({ contactId: null }), POINT, CREATE);

		expect(result?.fields?.contactId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names a missing address on the address field', () => {
		const result = validateServiceRequest(values({ addressId: null }), POINT, CREATE);

		expect(result?.fields?.addressId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	// The inline contact is a subform, so its issues land under `newContact.`.
	it('names an inline contact with no identifier on the intake form', () => {
		const result = validateServiceRequest(
			values({
				contactMode: 'new',
				contactId: null,
				newContact: { ...defaultContactFormValues(), wantsSms: true },
			}),
			POINT,
			CREATE,
		);

		expect(result?.fields?.['newContact.wantsSms']).toBeDefined();
	});

	it('checks the edit page too, where there is no point to draw', () => {
		expect(validateServiceRequest(values(), null, EDIT)).toBeUndefined();
		expect(
			validateServiceRequest(values({ details: '' }), null, EDIT)?.fields?.details,
		).toBeDefined();
	});
});
