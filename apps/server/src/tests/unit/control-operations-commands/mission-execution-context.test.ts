import { describe, expect, it } from 'vitest';
import { buildApplicationCreateCommand } from '../../../control-operations-commands/chemical-applications.js';
import {
	biocontrolActionConfig,
	outreachActionConfig,
	sourceReductionConfig,
} from '../../../control-operations-commands/performed-actions.js';

/**
 * A control action recorded off a mission stop stores what the same action
 * recorded outside one stores.
 *
 * The mission branch is a second construction of the same command, written
 * beside the ordinary one, and it silently omitted `context` on all four types:
 * the form sends `habitatId`/`inspectionId`/`collectionId` either way, the
 * writers read `payload.context ?? { kind: 'none' }`, so the action landed with
 * null links and nothing threw. The client-side wire test cannot see this — the
 * keys are on the request body in both cases — so the assertion has to be on the
 * command the endpoint builds.
 *
 * See `docs/adr/0012-assignment-item-action-provenance.md`.
 */
describe('mission execution keeps the action’s own context', () => {
	const ctx = {
		organizationId: '3f7c1d2e-8a5b-4c6d-9e0f-1a2b3c4d5e6f',
		actorProfileId: '0105b111-e0be-46b0-b5e9-a87507889b51',
	};
	const missionItemId = 'b1d9c8f7-6e5d-4c3b-a2f1-0e9d8c7b6a5f';
	const habitatId = 'c2e8b7a6-5d4c-4b3a-9f8e-7d6c5b4a3f2e';
	const inspectionId = 'd3f7a695-4c3b-4a29-8e7d-6c5b4a3f2e1d';

	it.each([
		[
			'chemical application',
			(payload: Record<string, unknown>) => buildApplicationCreateCommand(ctx as never, payload),
			{
				id: 'e4a6b584-3b2a-4918-9d6c-5b4a3f2e1d0c',
				insecticideId: 'f5b7c493-2a19-4807-8c5b-4a3f2e1d0c9b',
				amountApplied: 2,
				applicationUnitId: 'a6c8d5e2-1908-4716-9b4a-3f2e1d0c9b8a',
				applicationDate: '2026-08-11',
			},
			{ habitatId, inspectionId },
			{ kind: 'larval', habitatId, inspectionId },
		],
		[
			'source reduction',
			(payload: Record<string, unknown>) =>
				sourceReductionConfig.buildCreate(ctx as never, payload),
			{
				id: 'b7d9e6f1-0817-4625-8a39-2e1d0c9b8a79',
				sourceReductionDate: '2026-08-11',
				sourcesEliminatedAmount: 4,
				sourcesEliminatedUnitId: 'c8eaf702-9726-4534-9928-1d0c9b8a7968',
				sourceReductionMethodId: 'd9fb0813-8635-4443-8817-0c9b8a796857',
			},
			{ habitatId, inspectionId },
			{ kind: 'larval', habitatId, inspectionId },
		],
		[
			'outreach action',
			(payload: Record<string, unknown>) => outreachActionConfig.buildCreate(ctx as never, payload),
			{
				id: 'ea0c1924-7544-4352-9706-9b8a79685746',
				outreachDate: '2026-08-11',
				outreachMethodId: 'fb1d2a35-6453-4261-8615-8a7968574635',
				reach: 12,
			},
			// Outreach reaches people, not habitats: its larval context is the
			// inspection alone, and a habitat on it is refused by the domain. The
			// client's `OUTREACH_ACTION_FIELD_KEYS` agrees — it never sends one.
			{ inspectionId },
			{ kind: 'larval', inspectionId },
		],
		[
			'biocontrol action',
			(payload: Record<string, unknown>) =>
				biocontrolActionConfig.buildCreate(ctx as never, payload),
			{
				id: 'ac2e3b46-5362-4170-9524-79685746352a',
				biocontrolDate: '2026-08-11',
				amountReleased: 500,
				releaseUnitId: 'bd3f4c57-4271-4089-8433-685746352a19',
				biocontrolMethodId: 'ce405d68-3180-4998-9342-5746352a1908',
			},
			{ habitatId, inspectionId },
			{ kind: 'larval', habitatId, inspectionId },
		],
	])('carries the larval context of a %s', (_name, build, fields, context, expected) => {
		const command = build({ ...fields, ...context, missionItemId });

		expect(command.payload).toMatchObject({ missionItemId, context: expected });
	});

	it('leaves the context absent when the form sent none', () => {
		// `{ kind: 'none' }` rather than a missing key: the writers read
		// `payload.context ?? { kind: 'none' }`, and an action with no larval or
		// adult context is an ordinary action, not an invalid one.
		const command = buildApplicationCreateCommand(ctx as never, {
			id: 'e4a6b584-3b2a-4918-9d6c-5b4a3f2e1d0c',
			insecticideId: 'f5b7c493-2a19-4807-8c5b-4a3f2e1d0c9b',
			amountApplied: 2,
			applicationUnitId: 'a6c8d5e2-1908-4716-9b4a-3f2e1d0c9b8a',
			applicationDate: '2026-08-11',
			missionItemId,
		});

		expect(command.payload).toMatchObject({ context: { kind: 'none' }, missionItemId });
	});
});
