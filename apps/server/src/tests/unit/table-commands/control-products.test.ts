/**
 * The four product maps.
 *
 * Mostly column spelling, which is what the falsification covers. The two
 * readings worth naming are the pair of nullable link columns on an insecticide
 * — `label_url` and `msds_url` clear when sent as null and stay when absent —
 * and `acknowledgedDeactivateEmptyFormulation`, which rides on the component
 * edit as well as the removal because either can leave a formulation empty.
 */

import { describe, expect, it } from 'vitest';
import {
	formulationInsecticideTableCommands,
	formulationTableCommands,
	insecticideBatchTableCommands,
	insecticideTableCommands,
} from '../../../table-commands/control-products.js';
import { organizationHarness, ROW } from './command-harness.js';

const { request, build } = organizationHarness({ role: 'admin' });

const INSECTICIDE = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';
const FORMULATION = '66666666-6666-4666-8666-666666666666';

const insecticides = insecticideTableCommands(undefined as never);
const insecticideBatches = insecticideBatchTableCommands(undefined as never);
const formulations = formulationTableCommands(undefined as never);
const formulationInsecticides = formulationInsecticideTableCommands(undefined as never);

describe('insecticides intent map', () => {
	it('reads a product off column names', () => {
		const command = build(
			insecticides,
			'controlOperations.createInsecticide',
			request({
				trade_name: 'Anvil 10+10',
				active_ingredient: 'Sumithrin',
				type: 'adulticide',
				registration_number: '1021-1688-8329',
				default_unit_id: UNIT,
				shorthand: 'ANV',
			}),
		);

		expect(command.payload).toMatchObject({
			insecticideId: ROW,
			tradeName: 'Anvil 10+10',
			activeIngredient: 'Sumithrin',
			type: 'adulticide',
			registrationNumber: '1021-1688-8329',
			defaultUnitId: UNIT,
			shorthand: 'ANV',
		});
	});

	it('clears a label link sent as null and leaves an absent one', () => {
		const cleared = build(
			insecticides,
			'controlOperations.updateInsecticide',
			request({ label_url: null }),
		);
		const untouched = build(
			insecticides,
			'controlOperations.updateInsecticide',
			request({ shorthand: 'ANV' }),
		);

		expect(cleared.payload).toMatchObject({ changes: { labelUrl: null } });
		expect((untouched.payload as { changes: object }).changes).not.toHaveProperty('labelUrl');
	});

	it('carries the dependent acknowledgement on deactivate and not on reactivate', () => {
		// Retiring a product takes its batches and formulations with it. Turning one
		// back on takes nothing with it, so there is nothing to confirm.
		const off = build(
			insecticides,
			'controlOperations.deactivateInsecticide',
			request({ acknowledgedDependentDeactivation: false }),
		);
		const on = build(insecticides, 'controlOperations.reactivateInsecticide', request({}));

		expect(off.payload).toMatchObject({ acknowledgedDependentDeactivation: false });
		expect(on.payload).not.toHaveProperty('acknowledgedDependentDeactivation');
	});
});

describe('insecticide_batches intent map', () => {
	it('reads a batch off its own two columns', () => {
		const command = build(
			insecticideBatches,
			'controlOperations.createInsecticideBatch',
			request({ insecticide_id: INSECTICIDE, batch_name: 'LOT-2026-114' }),
		);

		expect(command.payload).toMatchObject({
			insecticideBatchId: ROW,
			insecticideId: INSECTICIDE,
			batchName: 'LOT-2026-114',
		});
	});
});

describe('formulations intent map', () => {
	it('reads a recipe off column names', () => {
		const command = build(
			formulations,
			'controlOperations.createFormulation',
			request({
				formulation_name: 'Truck ULV mix',
				batch_size: 26,
				batch_unit_id: UNIT,
			}),
		);

		expect(command.payload).toMatchObject({
			formulationId: ROW,
			formulationName: 'Truck ULV mix',
			batchSize: 26,
			batchUnitId: UNIT,
		});
	});

	it('activates and deactivates by name', () => {
		const on = build(formulations, 'controlOperations.activateFormulation', request({}));
		const off = build(formulations, 'controlOperations.deactivateFormulation', request({}));

		expect([on.type, off.type]).toEqual([
			'controlOperations.activateFormulation',
			'controlOperations.deactivateFormulation',
		]);
	});
});

describe('formulation_insecticides intent map', () => {
	it('reads a component off the link row columns', () => {
		const command = build(
			formulationInsecticides,
			'controlOperations.addFormulationInsecticide',
			request({
				formulation_id: FORMULATION,
				insecticide_id: INSECTICIDE,
				amount: 0.5,
				unit_id: UNIT,
			}),
		);

		expect(command.payload).toMatchObject({
			formulationInsecticideId: ROW,
			formulationId: FORMULATION,
			insecticideId: INSECTICIDE,
			amount: 0.5,
			unitId: UNIT,
		});
	});

	it('carries the empty-formulation acknowledgement on the edit as well as the removal', () => {
		// Either can leave the formulation with nothing in it, which deactivates it.
		const edited = build(
			formulationInsecticides,
			'controlOperations.updateFormulationInsecticide',
			request({ amount: 0.25, acknowledgedDeactivateEmptyFormulation: false }),
		);
		const removed = build(
			formulationInsecticides,
			'controlOperations.removeFormulationInsecticide',
			request({ acknowledgedDeactivateEmptyFormulation: false }),
		);

		expect(edited.payload).toMatchObject({ acknowledgedDeactivateEmptyFormulation: false });
		expect(removed.payload).toMatchObject({ acknowledgedDeactivateEmptyFormulation: false });
	});
});
