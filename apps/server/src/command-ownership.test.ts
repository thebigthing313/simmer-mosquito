import type { SimmerDatabase, Transaction } from '@simmer-mosquito/db';
import type { FieldWorkCommandType, MissionDispatchCommandType } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import { resolveCommandOwnership } from './command-ownership.js';
import type { CommandActor } from './command-permissions.js';

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const theirs: CommandActor = { role: 'collector', profileId: 'profile_collector' };
const manager: CommandActor = { role: 'manager', profileId: 'profile_manager' };

const assignmentId = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';
const assignmentItemId = 'c8d3f1b5-7a1f-4d4a-8e2f-7b5b5c8d0e32';
const missionItemId = 'd9e4a2c6-8b2a-4e5b-9f3a-8c6c6d9e1f43';
const commentId = 'ea5b3d7f-9c3b-4f6c-8a4b-9d7d7eaf2a54';

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
			command('missionDispatch.recordChemicalApplicationForMissionItem', { missionItemId }),
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

function command(
	type: FieldWorkCommandType | MissionDispatchCommandType,
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
