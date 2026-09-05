/**
 * The three performed-action maps, as translations.
 *
 * Two things here are not just column spelling. The mission-stop create used to
 * be chosen by whether `missionItemId` was in the body, and the surveillance
 * context used to be rebuilt from whichever of `habitatId`, `inspectionId` and
 * `collectionId` happened to be present. Both are named now, and the second is a
 * deliberate narrowing rather than a rename — so it gets a test that says what
 * the new reading does with the old body.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { OrganizationCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import {
	biocontrolActionTableCommands,
	outreachActionTableCommands,
	sourceReductionTableCommands,
} from '../../../table-commands/performed-actions.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';
const METHOD = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';
const HABITAT = '66666666-6666-4666-8666-666666666666';
const MISSION_ITEM = '77777777-7777-4777-8777-777777777777';

const GEOMETRY = { kind: 'geometry', geometry: { type: 'Point', coordinates: [-81, 28] } };
const WHEN = '2026-08-10';

const sourceReductions = sourceReductionTableCommands(undefined as never);
const outreachActions = outreachActionTableCommands(undefined as never);
const biocontrolActions = biocontrolActionTableCommands(undefined as never);

function request(payload: Record<string, unknown>): IntentRequest<CommandTable, string> {
	return {
		payload,
		organization: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id: ROW,
	};
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<CommandTable, TCommand, unknown, string>,
	intent: OrganizationCommandType,
	intentRequest: IntentRequest<CommandTable, string>,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

function sourceReductionBody(): Record<string, unknown> {
	return {
		locationSource: GEOMETRY,
		source_reduction_method_id: METHOD,
		source_reduction_date: WHEN,
		sources_eliminated_amount: 3,
		sources_eliminated_unit_id: UNIT,
	};
}

describe('performed action intent maps', () => {
	it('reads each action off its own measurement columns', () => {
		const reduction = build(
			sourceReductions,
			'controlOperations.recordSourceReduction',
			request(sourceReductionBody()),
		);
		const outreach = build(
			outreachActions,
			'controlOperations.recordOutreachAction',
			request({
				locationSource: GEOMETRY,
				outreach_method_id: METHOD,
				outreach_date: WHEN,
				reach: 40,
				reach_description: 'Two blocks door to door',
			}),
		);
		const biocontrol = build(
			biocontrolActions,
			'controlOperations.recordBiocontrolAction',
			request({
				locationSource: GEOMETRY,
				biocontrol_method_id: METHOD,
				biocontrol_date: WHEN,
				amount_released: 500,
				release_unit_id: UNIT,
			}),
		);

		expect(reduction.payload).toMatchObject({
			sourceReductionId: ROW,
			sourceReductionMethodId: METHOD,
			sourceReductionDate: WHEN,
			sourcesEliminatedAmount: 3,
			sourcesEliminatedUnitId: UNIT,
		});
		expect(outreach.payload).toMatchObject({
			outreachActionId: ROW,
			reach: 40,
			reachDescription: 'Two blocks door to door',
		});
		expect(biocontrol.payload).toMatchObject({
			biocontrolActionId: ROW,
			amountReleased: 500,
			releaseUnitId: UNIT,
		});
	});

	it('records off a stop only when that is the command, not when the body has one', () => {
		// The old route read `missionItemId` for the decision, so a body that carried
		// one could not ask for the plain record.
		const plain = build(
			sourceReductions,
			'controlOperations.recordSourceReduction',
			request({ ...sourceReductionBody(), mission_item_id: MISSION_ITEM }),
		);

		expect(plain.type).toBe('controlOperations.recordSourceReduction');
		expect(plain.payload).not.toHaveProperty('missionItemId');
	});

	it('carries the stop and the record together when it is the stop command', () => {
		const command = build(
			sourceReductions,
			'missionDispatch.recordSourceReductionForMissionItem',
			request({
				mission_item_id: MISSION_ITEM,
				geometry: GEOMETRY.geometry,
				source_reduction_method_id: METHOD,
				source_reduction_date: WHEN,
				sources_eliminated_amount: 3,
				sources_eliminated_unit_id: UNIT,
			}),
		);

		expect(command.type).toBe('missionDispatch.recordSourceReductionForMissionItem');
		expect(command.payload).toMatchObject({
			missionItemId: MISSION_ITEM,
			sourceReductionId: ROW,
			sourcesEliminatedAmount: 3,
		});
	});

	it('takes the context whole and does not rebuild it from foreign keys', () => {
		// The narrowing. The old reader turned a bare `habitatId` into
		// `{ kind: 'larval', habitatId }`, so which surveillance record an action was
		// attached to depended on which ids the form happened to send. A caller
		// states the context now, and an absent one is `none` — which is a real
		// answer, since plenty of work is attached to nothing.
		const stated = build(
			sourceReductions,
			'controlOperations.recordSourceReduction',
			request({ ...sourceReductionBody(), context: { kind: 'larval', habitatId: HABITAT } }),
		);
		const inferred = build(
			sourceReductions,
			'controlOperations.recordSourceReduction',
			request({ ...sourceReductionBody(), habitat_id: HABITAT }),
		);

		expect(stated.payload).toMatchObject({ context: { kind: 'larval', habitatId: HABITAT } });
		expect(inferred.payload).toMatchObject({ context: { kind: 'none' } });
	});

	it('changes only the placement fields an edit named', () => {
		const command = build(
			sourceReductions,
			'controlOperations.updateSourceReductionLocationAndContext',
			request({ address_id: null }),
		);

		expect(command.payload).toMatchObject({ changes: { addressId: null } });
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('context');
	});

	it('treats an absent support-record acknowledgement as given', () => {
		const assumed = build(
			biocontrolActions,
			'controlOperations.deleteBiocontrolAction',
			request({}),
		);
		const withheld = build(
			biocontrolActions,
			'controlOperations.deleteBiocontrolAction',
			request({ acknowledgedSupportRecordDeletion: false }),
		);

		expect(assumed.payload).toMatchObject({ acknowledgedSupportRecordDeletion: true });
		expect(withheld.payload).toMatchObject({ acknowledgedSupportRecordDeletion: false });
	});
});
