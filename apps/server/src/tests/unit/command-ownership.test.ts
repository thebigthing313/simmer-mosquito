import type { SimmerDatabase, Transaction } from '@simmer-mosquito/db';
import type {
	ControlOperationsCommandType,
	FieldWorkCommandType,
	MissionDispatchCommandType,
} from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import { resolveCommandOwnership } from '../../command-ownership.js';
import type { CommandActor } from '../../command-permissions.js';

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const theirs: CommandActor = { role: 'collector', profileId: 'profile_collector' };
const manager: CommandActor = { role: 'manager', profileId: 'profile_manager' };

const assignmentId = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';
const assignmentItemId = 'c8d3f1b5-7a1f-4d4a-8e2f-7b5b5c8d0e32';
const missionItemId = 'd9e4a2c6-8b2a-4e5b-9f3a-8c6c6d9e1f43';
const commentId = 'ea5b3d7f-9c3b-4f6c-8a4b-9d7d7eaf2a54';
const treatmentId = 'fb6c4e80-ad4c-4a7d-9b5c-ae8e8fb03b65';
const sourceReductionId = '0c7d5f91-be5d-4b8e-8c6d-bf9f90c14c76';
const biocontrolActionId = '1d8e6a02-cf6e-4c9f-9d7e-c0a0a1d25d87';
const requestedControlActionId = '2e9f7b13-d07f-4da0-8e8f-d1b1b2e36e98';

describe('resolveCommandOwnership', () => {
	it('lets a collector progress a stop on their own assignment', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				assignment_items: { assignment_id: assignmentId },
				assignments: { assigned_to_profile_id: theirs.profileId },
			}),
			command('fieldWork.completeAssignmentItem', { assignmentItemId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it("refuses a collector a stop on somebody else's assignment", async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				assignment_items: { assignment_id: assignmentId },
				assignments: { assigned_to_profile_id: 'profile_someone_else' },
			}),
			command('fieldWork.completeAssignmentItem', { assignmentItemId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'Collectors can only work assignments assigned to them.',
		});
	});

	it('refuses a collector an assignment nobody is assigned to', async () => {
		const outcome = await resolveCommandOwnership(
			rows({ assignments: { assigned_to_profile_id: null } }),
			command('fieldWork.startAssignment', { assignmentId }),
			theirs,
		);

		expect(outcome).toMatchObject({ kind: 'refused' });
	});

	it('reports a stop that does not exist as missing, by its own name', async () => {
		const outcome = await resolveCommandOwnership(
			rows({}),
			command('fieldWork.completeAssignmentItem', { assignmentItemId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'missing', entity: 'assignment_item' });
	});

	// The check the permission map exists to make unforgettable: these four
	// commands have no handler yet, so nothing in the write path could have
	// remembered to ask. The map answers for them.
	it('checks a command that has no handler yet', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				mission_items: { mission_id: 'mission_1' },
				missions: { assigned_to_profile_id: 'profile_someone_else' },
			}),
			command('missionDispatch.recordTreatmentForMissionItem', { missionItemId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'Collectors can only execute missions assigned to them.',
		});
	});

	it('reads nothing for a manager, who was already allowed by role', async () => {
		const outcome = await resolveCommandOwnership(
			unreadable(),
			command('fieldWork.completeAssignmentItem', { assignmentItemId }),
			manager,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it('reads nothing for a command whose rule is a role floor', async () => {
		const outcome = await resolveCommandOwnership(
			unreadable(),
			command('fieldWork.addComment', { commentId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it('lets an author correct their own comment inside the window', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				comments: {
					commented_by_profile_id: theirs.profileId,
					commented_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
				},
			}),
			command('fieldWork.updateComment', { commentId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it('closes the correction window on an old comment of their own', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				comments: {
					commented_by_profile_id: theirs.profileId,
					commented_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
				},
			}),
			command('fieldWork.deleteComment', { commentId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'Comments can only be changed by their author for 30 days.',
		});
	});

	it("refuses somebody else's comment", async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				comments: {
					commented_by_profile_id: 'profile_someone_else',
					commented_at: new Date(),
				},
			}),
			command('fieldWork.updateComment', { commentId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'Only the author or a manager can change this comment.',
		});
	});

	// An ownership rule that cannot find its subject must not read as "allowed".
	it('refuses rather than allows when the command carries no organization', async () => {
		const outcome = await resolveCommandOwnership(
			unreadable(),
			{ type: 'fieldWork.startAssignment', payload: { assignmentId } },
			theirs,
		);

		expect(outcome).toMatchObject({ kind: 'refused' });
	});
});

/**
 * OWN_TREATMENT: a Collector corrects their own Treatment for 30 days after its
 * `application_date`, and a Manager or above corrects any. The three PATCH
 * intents share it, `reviseTreatmentLines` included, which is where the old
 * guarded correction for changing an Insecticide folded in.
 */
describe('treatment correction floor', () => {
	const dayMs = 24 * 60 * 60 * 1000;

	it.each([
		'controlOperations.updateTreatmentFieldDetails',
		'controlOperations.updateTreatmentLocationAndContext',
		'controlOperations.reviseTreatmentLines',
	] as const)('lets a collector run %s on their own recent treatment', async (type) => {
		const outcome = await resolveCommandOwnership(
			rows({ treatments: { performed_on: new Date(), performer_id: theirs.profileId } }),
			command(type, { treatmentId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it('closes the window 30 days after the application date', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				treatments: {
					performed_on: new Date(Date.now() - 31 * dayMs),
					performer_id: theirs.profileId,
				},
			}),
			command('controlOperations.reviseTreatmentLines', { treatmentId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'Control actions can only be corrected by their performer for 30 days.',
		});
	});

	it("refuses a collector somebody else's treatment", async () => {
		const outcome = await resolveCommandOwnership(
			rows({ treatments: { performed_on: new Date(), performer_id: 'profile_someone_else' } }),
			command('controlOperations.updateTreatmentFieldDetails', { treatmentId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'Collectors can only correct control actions they performed.',
		});
	});

	it('answers a treatment that is not there as missing', async () => {
		const outcome = await resolveCommandOwnership(
			rows({}),
			command('controlOperations.reviseTreatmentLines', { treatmentId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'missing', entity: 'control_action' });
	});

	it('reads nothing for a manager correcting an old or foreign treatment', async () => {
		const outcome = await resolveCommandOwnership(
			unreadable(),
			command('controlOperations.reviseTreatmentLines', { treatmentId }),
			manager,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});
});

/**
 * `docs/control-operations-domain.md`: a collector may delete their own action
 * record inside the correction window "when no supervisory/associated-record
 * rules require manager escalation". These are the rules that escalate it, and
 * the point of each case is which one fires — a refusal that does not name what
 * is holding the record is the thing that makes the rule feel arbitrary.
 */
describe('control-action deletion escalations', () => {
	const recent = { performed_on: new Date(), performer_id: theirs.profileId };

	it('lets a collector delete their own recent standalone record', async () => {
		const outcome = await resolveCommandOwnership(
			rows({ source_reductions: { ...recent, requested_control_action_id: null } }),
			command('controlOperations.deleteSourceReduction', { sourceReductionId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it('escalates a record that has comments or assisting people on it', async () => {
		for (const supportTable of ['comments', 'additional_personnel'] as const) {
			const outcome = await resolveCommandOwnership(
				rows({
					source_reductions: { ...recent, requested_control_action_id: null },
					[supportTable]: {},
				}),
				command('controlOperations.deleteSourceReduction', { sourceReductionId }),
				theirs,
			);

			expect(outcome).toEqual({
				kind: 'refused',
				reason: 'This record has comments or assisting personnel on it. A manager can delete it.',
			});
		}
	});

	it('escalates a treatment whose lines carry batch links', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				treatments: { ...recent, requested_control_action_id: null },
				application_batches: {},
			}),
			command('controlOperations.deleteTreatment', { treatmentId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'This treatment has insecticide batches linked to it. A manager can delete it.',
		});
	});

	// The order is the escalation order the doc reads: support rows, then batch
	// links, then the requested-action link. The first one that applies is named.
	it('escalates a treatment for its support rows before its batch links', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				treatments: { ...recent, requested_control_action_id: null },
				comments: {},
				application_batches: {},
			}),
			command('controlOperations.deleteTreatment', { treatmentId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'This record has comments or assisting personnel on it. A manager can delete it.',
		});
	});

	it('escalates a treatment that answers a requested control action', async () => {
		const outcome = await resolveCommandOwnership(
			rows({ treatments: { ...recent, requested_control_action_id: requestedControlActionId } }),
			command('controlOperations.deleteTreatment', { treatmentId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'This record answers a requested control action. A manager can delete it.',
		});
	});

	it('lets a collector delete their own recent standalone treatment', async () => {
		const outcome = await resolveCommandOwnership(
			rows({ treatments: { ...recent, requested_control_action_id: null } }),
			command('controlOperations.deleteTreatment', { treatmentId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it('escalates a record that answers a requested control action', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				biocontrol_actions: { ...recent, requested_control_action_id: requestedControlActionId },
			}),
			command('controlOperations.deleteBiocontrolAction', { biocontrolActionId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'This record answers a requested control action. A manager can delete it.',
		});
	});

	it('escalates a request once recorded work or a mission references it', async () => {
		for (const referrer of ['outreach_actions', 'mission_items'] as const) {
			const outcome = await resolveCommandOwnership(
				rows({
					requested_control_actions: { ...recent, resolved_at: null },
					[referrer]: {},
				}),
				command('controlOperations.deleteRequestedControlAction', { requestedControlActionId }),
				theirs,
			);

			expect(outcome).toEqual({
				kind: 'refused',
				reason:
					'This request is referenced by recorded work or a mission. A manager can delete it.',
			});
		}
	});

	it('escalates a resolved request, because resolving it was supervisory', async () => {
		const outcome = await resolveCommandOwnership(
			rows({ requested_control_actions: { ...recent, resolved_at: new Date() } }),
			command('controlOperations.deleteRequestedControlAction', { requestedControlActionId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'This request has been resolved. A manager can delete it.',
		});
	});

	it('lets a collector delete their own unresolved, unreferenced request', async () => {
		const outcome = await resolveCommandOwnership(
			rows({ requested_control_actions: { ...recent, resolved_at: null } }),
			command('controlOperations.deleteRequestedControlAction', { requestedControlActionId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it('leaves corrections alone: only deletion escalates', async () => {
		// The same record, the same support rows, the command that changes fields
		// rather than removing them. An `update*` cannot orphan anything.
		const outcome = await resolveCommandOwnership(
			rows({
				source_reductions: { ...recent, requested_control_action_id: requestedControlActionId },
				comments: {},
			}),
			command('controlOperations.updateSourceReductionFieldDetails', { sourceReductionId }),
			theirs,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});

	it('still refuses a record that is not theirs before looking at what depends on it', async () => {
		const outcome = await resolveCommandOwnership(
			rows({
				source_reductions: { performed_on: new Date(), performer_id: 'profile_someone_else' },
			}),
			command('controlOperations.deleteSourceReduction', { sourceReductionId }),
			theirs,
		);

		expect(outcome).toEqual({
			kind: 'refused',
			reason: 'Collectors can only correct control actions they performed.',
		});
	});

	it('reads nothing for a manager, who was already allowed by role', async () => {
		const outcome = await resolveCommandOwnership(
			unreadable(),
			command('controlOperations.deleteTreatment', { treatmentId }),
			manager,
		);

		expect(outcome).toEqual({ kind: 'allowed' });
	});
});

function command(
	type: ControlOperationsCommandType | FieldWorkCommandType | MissionDispatchCommandType,
	payload: Record<string, unknown>,
) {
	return { type, payload: { organizationId, ...payload } };
}

/**
 * The slice of the query builder the ownership readers use, answering with one
 * canned row per table.
 */
function rows(
	tables: Readonly<Record<string, Record<string, unknown> | undefined>>,
): Transaction<SimmerDatabase> {
	return {
		selectFrom(table: string) {
			const builder = {
				select: () => builder,
				where: () => builder,
				limit: () => builder,
				innerJoin: () => builder,
				executeTakeFirst: async () => tables[table],
			};
			return builder;
		},
	} as never;
}

/** A transaction that fails the test if a check reads from it at all. */
function unreadable(): Transaction<SimmerDatabase> {
	return {
		selectFrom() {
			throw new Error('Ownership must not query for a command the role already settled.');
		},
	} as never;
}
