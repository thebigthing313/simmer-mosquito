/**
 * The stop id has to reach the endpoint, because it is the only thing that tells
 * the server this write is an execution rather than an ordinary record.
 *
 * This seam is where the feature can go quiet. The domain command, the server
 * handler, the migration and the optimistic row can all be correct and fully
 * covered, and the record still lands with a null link and its stop still
 * pending — the server simply takes the non-execution branch, answers 201, and
 * sync reverts the optimistic link a moment later. Nothing throws and nothing
 * below this layer can see it.
 *
 * `mutateCollection` derives its body from the mutation, and `commandRequestFor`
 * is tested for that in `packages/sync`. A stop recording does not go that way:
 * it is a multi-row command, so it goes through `commandTransaction`, which
 * sends the body it is handed. That body is built here, which is why the
 * assertion is here.
 *
 * See `docs/adr/0012-assignment-item-action-provenance.md`.
 */

import type { Inspection } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import { stopInspectionRequestBody } from '../../../../hooks/mutations/use-inspection-mutations';

const ASSIGNMENT_ITEM = '11111111-1111-4111-8111-111111111111';

function inspectionRow(): Inspection {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		organization_id: '33333333-3333-4333-8333-333333333333',
		lat: 40.5,
		lng: -74.4,
		geom_type: 'Point',
		habitat_id: '44444444-4444-4444-8444-444444444444',
		habitat_type_id: null,
		address_id: null,
		inspected_by_profile_id: '55555555-5555-4555-8555-555555555555',
		assignment_item_id: ASSIGNMENT_ITEM,
		inspection_date: '2026-08-18',
		is_wet: false,
		dip_count: null,
		density: null,
		larvae_count: null,
		has_eggs: false,
		has_first_instar: false,
		has_second_instar: false,
		has_third_instar: false,
		has_fourth_instar: false,
		has_pupae: false,
		created_by_profile_id: null,
		updated_by_profile_id: null,
		created_at: new Date('2026-08-18T00:00:00.000Z'),
		updated_at: new Date('2026-08-18T00:00:00.000Z'),
	};
}

describe('stopInspectionRequestBody', () => {
	it('sends the assignment stop the inspection was recorded from', () => {
		const body = stopInspectionRequestBody(inspectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			habitatId: null,
		});

		expect(body.assignment_item_id).toBe(ASSIGNMENT_ITEM);
	});

	it('leaves the habitat to the stop unless one is stated', () => {
		const body = stopInspectionRequestBody(inspectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			habitatId: null,
		});

		// The stop already names a habitat. Sending the row's own would be a second
		// claim about the same thing, and the two can disagree.
		expect(body.habitat_id).toBeNull();
	});

	it('states the habitat when the caller overrides the stop', () => {
		const body = stopInspectionRequestBody(inspectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			habitatId: '66666666-6666-4666-8666-666666666666',
		});

		expect(body.habitat_id).toBe('66666666-6666-4666-8666-666666666666');
	});

	it('sends the inspection result', () => {
		const body = stopInspectionRequestBody(inspectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			habitatId: null,
		});

		expect(body.inspection_date).toBe('2026-08-18');
		expect(body.is_wet).toBe(false);
		expect(body.has_pupae).toBe(false);
	});

	it('drops the columns the server owns', () => {
		const body = stopInspectionRequestBody(inspectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			habitatId: null,
		});

		// The centroid is snapshotted from the habitat at commit, and the stamps are
		// the server's own — an optimistic row carries them so the map can draw, but
		// sending them would be the client claiming to have written them.
		for (const column of [
			'lat',
			'lng',
			'geom_type',
			'organization_id',
			'created_at',
			'updated_at',
			'created_by_profile_id',
			'updated_by_profile_id',
		]) {
			expect(body).not.toHaveProperty(column);
		}
	});

	it('carries the acknowledgements a refused attempt is answering', () => {
		const body = stopInspectionRequestBody(
			inspectionRow(),
			{ assignmentItemId: ASSIGNMENT_ITEM, habitatId: null },
			{ acknowledgedCompletedItemAdditionalRecord: true },
		);

		expect(body.acknowledgedCompletedItemAdditionalRecord).toBe(true);
	});
});
