/**
 * The three decisions a performed control action shares with the other three.
 *
 * A chemical application, a biocontrol release, a source reduction and an
 * outreach action each map their own columns, and none of that is here. What is
 * here is the reasoning four hooks reuse: which larval attachment a save states,
 * whether a custom-field bag moved, and which of the two edit commands the save
 * means. Each of the three fails silently when it is wrong. A context that names
 * the Habitat alone clears the Inspection on the server; a rebuilt metadata
 * object read as a change names a command with nothing in it and is refused; a
 * placement change sent under the field-details name is dropped behind a 200.
 */

import { describe, expect, it } from 'vitest';
import {
	actionEditIntents,
	contextFor,
	metadataChanged,
} from '../../../../hooks/mutations/performed-action-writes';

const HABITAT = '44444444-4444-4444-8444-444444444444';
const INSPECTION = '77777777-7777-4777-8777-777777777777';

const FIELDS_INTENT = 'controlOperations.updateChemicalApplicationFieldDetails';
const PLACEMENT_INTENT = 'controlOperations.updateChemicalApplicationLocationAndContext';

describe('the context a save states', () => {
	it('detaches the record when neither id is set', () => {
		// Not an absent context. `{ kind: 'none' }` says the attachment is being
		// cleared, which is a different request from saying nothing about it.
		expect(contextFor(null, null)).toEqual({ kind: 'none' });
	});

	it('carries the habitat alone when that is all there is', () => {
		expect(contextFor(HABITAT, null)).toEqual({ kind: 'larval', habitatId: HABITAT });
	});

	it('carries the inspection alone when that is all there is', () => {
		expect(contextFor(null, INSPECTION)).toEqual({ kind: 'larval', inspectionId: INSPECTION });
	});

	it('carries both, which is what keeps an inspection from being cleared', () => {
		expect(contextFor(HABITAT, INSPECTION)).toEqual({
			kind: 'larval',
			habitatId: HABITAT,
			inspectionId: INSPECTION,
		});
	});

	it('omits the id it was not given rather than sending it undefined', () => {
		// `contextIds` reads both fields by presence, so an `inspectionId: undefined`
		// key is the clearing request rather than silence about it. `toEqual` treats
		// the two as the same object, so the keys are what has to be read.
		expect(Object.keys(contextFor(HABITAT, null))).not.toContain('inspectionId');
		expect(Object.keys(contextFor(null, INSPECTION))).not.toContain('habitatId');
	});
});

describe('whether a custom-field bag moved', () => {
	it('reads a rebuilt bag with the same contents as unchanged', () => {
		// A form rebuilds `metadata` on every render, so reference equality would
		// call every save a change and name a command the change set has nothing for.
		expect(
			metadataChanged({ trapNights: 3, notes: 'wind' }, { trapNights: 3, notes: 'wind' }),
		).toBe(false);
	});

	it('reads undefined and null as the same absence', () => {
		// The column arrives as null from Postgres and as undefined from a form that
		// never set it. Neither is a change into the other.
		expect(metadataChanged(undefined, null)).toBe(false);
		expect(metadataChanged(null, undefined)).toBe(false);
	});

	it('reads a changed value as a change', () => {
		expect(metadataChanged({ trapNights: 3 }, { trapNights: 4 })).toBe(true);
	});

	it('reads a bag appearing where there was none as a change', () => {
		expect(metadataChanged(null, { trapNights: 3 })).toBe(true);
	});
});

describe('the commands one edit means', () => {
	it('names nothing when nothing moved, which means there is no write', () => {
		expect(actionEditIntents(false, false, FIELDS_INTENT, PLACEMENT_INTENT)).toEqual([]);
	});

	it('names the field-details command alone when only the measurements moved', () => {
		expect(actionEditIntents(true, false, FIELDS_INTENT, PLACEMENT_INTENT)).toEqual([
			FIELDS_INTENT,
		]);
	});

	it('names the location-and-context command alone when only the placement moved', () => {
		expect(actionEditIntents(false, true, FIELDS_INTENT, PLACEMENT_INTENT)).toEqual([
			PLACEMENT_INTENT,
		]);
	});

	it('names both in order, field details first', () => {
		// The server builds and runs the commands in the order the list gives, so
		// the order is part of the request rather than an accident of this array.
		expect(actionEditIntents(true, true, FIELDS_INTENT, PLACEMENT_INTENT)).toEqual([
			FIELDS_INTENT,
			PLACEMENT_INTENT,
		]);
	});
});
