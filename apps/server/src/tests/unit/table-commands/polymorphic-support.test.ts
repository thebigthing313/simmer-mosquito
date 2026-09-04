/**
 * The three polymorphic support tables, as translations.
 *
 * `comments`, `tag_items` and `additional_personnel` hang off any record through
 * an `entity_type`/`entity_id` pair, and all three read it the same way. That
 * pair is the reason they are tested together: the column holds the
 * discriminator in snake_case while the domain's target vocabulary is camelCase,
 * so every write across these tables crosses one bridge, and a break in it fails
 * as a refusal naming a target type nobody typed.
 *
 * Which types each table accepts is not the same list, and that is the second
 * thing here. `readEntityTarget` casts rather than narrows, on purpose: a
 * Comment goes on seventeen kinds of record, a Tag on six, and an Additional
 * Personnel row on the six kinds of field work. Narrowing at the reader would be a second copy of
 * three lists, so the domain's own check is what refuses a target, and these
 * pin that it does.
 *
 * No database is involved: a builder is a pure function, and `run` is never
 * touched.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { AgencyCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import { additionalPersonnelTableCommands } from '../../../table-commands/additional-personnel.js';
import { commentTableCommands } from '../../../table-commands/comments.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { tagItemTableCommands } from '../../../table-commands/tag-items.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const COMMENT = '33333333-3333-4333-8333-333333333333';
const TAG_ITEM = '44444444-4444-4444-8444-444444444444';
const ADDITIONAL_PERSONNEL = '55555555-5555-4555-8555-555555555555';
const TAG = '66666666-6666-4666-8666-666666666666';
const SERVICE_REQUEST = '77777777-7777-4777-8777-777777777777';
const SOURCE_REDUCTION = '88888888-8888-4888-8888-888888888888';
const HABITAT = '99999999-9999-4999-8999-999999999999';
const COLLECTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROFILE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** The maps, with no database. Nothing here reaches `run`. */
const comments = commentTableCommands(undefined as never);
const tagItems = tagItemTableCommands(undefined as never);
const additionalPersonnel = additionalPersonnelTableCommands(undefined as never);

function request(
	id: string,
	payload: Record<string, unknown>,
): IntentRequest<CommandTable, string> {
	return {
		payload,
		agency: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id,
	};
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<CommandTable, TCommand, unknown, string>,
	intent: AgencyCommandType,
	id: string,
	payload: Record<string, unknown>,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(request(id, payload));
}

describe('comments intent map', () => {
	it('reads a Comment off column names, target included', () => {
		const command = build(comments, 'fieldWork.addComment', COMMENT, {
			entity_type: 'source_reduction',
			entity_id: SOURCE_REDUCTION,
			comment_text: 'Culvert cleared, ditch still holding water',
			commented_at: '2026-08-10T15:30:00.000Z',
		});

		expect(command.type).toBe('fieldWork.addComment');
		expect(command.payload).toMatchObject({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			commentId: COMMENT,
			target: { type: 'sourceReduction', id: SOURCE_REDUCTION },
			commentText: 'Culvert cleared, ditch still holding water',
			commentedAt: new Date('2026-08-10T15:30:00.000Z'),
		});
	});

	it('refuses the same body keyed camelCase', () => {
		// The target would read as a pair of empty strings and the text as absent,
		// so the refusal would name three fields the request actually carried.
		expect(() =>
			build(comments, 'fieldWork.addComment', COMMENT, {
				entityType: 'sourceReduction',
				entityId: SOURCE_REDUCTION,
				commentText: 'Culvert cleared',
			}),
		).toThrow(DomainValidationError);
	});

	it('carries no moment when the body sent no time', () => {
		// `commented_at` is when the Comment was left rather than when the row was
		// written, so one keyed in after the fact carries its own and one left now
		// carries none, which the writer stamps.
		const command = build(comments, 'fieldWork.addComment', COMMENT, {
			entity_type: 'habitat',
			entity_id: HABITAT,
			comment_text: 'Access gate code changed',
		});

		expect(command.payload).toMatchObject({ commentedAt: null });
	});

	it('pins by name rather than by reading is_pinned', () => {
		// Both bodies point the boolean the wrong way. Which way a pin moved is the
		// command's to say, and the column is never read to decide it.
		const pinned = build(comments, 'fieldWork.pinComment', COMMENT, { is_pinned: false });
		const unpinned = build(comments, 'fieldWork.unpinComment', COMMENT, { is_pinned: true });

		expect(pinned.type).toBe('fieldWork.pinComment');
		expect(unpinned.type).toBe('fieldWork.unpinComment');
		expect(pinned.payload).toEqual({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			commentId: COMMENT,
		});
		expect(unpinned.payload).toEqual({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			commentId: COMMENT,
		});
	});

	it('lets one payload be both a correction and a pin', () => {
		// `intents` is a list, so a save that fixes the text and pins the Comment
		// names two commands over one body. Only `updateComment` reads a field, so neither
		// can take the other's by mistake.
		const body = { comment_text: 'Corrected: ditch drains to the north' };
		const updated = build(comments, 'fieldWork.updateComment', COMMENT, body);
		const pinned = build(comments, 'fieldWork.pinComment', COMMENT, body);

		expect(updated.payload).toMatchObject({
			commentId: COMMENT,
			commentText: 'Corrected: ditch drains to the north',
		});
		expect(pinned.payload).not.toHaveProperty('commentText');
	});

	it('refuses a correction that carried no text', () => {
		expect(() => build(comments, 'fieldWork.updateComment', COMMENT, {})).toThrow(
			DomainValidationError,
		);
	});

	it('deletes by id alone', () => {
		const command = build(comments, 'fieldWork.deleteComment', COMMENT, {
			entity_type: 'habitat',
			entity_id: HABITAT,
		});

		expect(command.payload).toMatchObject({ commentId: COMMENT });
		expect(command.payload).not.toHaveProperty('target');
	});

	it('accepts five intents', () => {
		expect(Object.keys(comments.intents).sort()).toEqual([
			'fieldWork.addComment',
			'fieldWork.deleteComment',
			'fieldWork.pinComment',
			'fieldWork.unpinComment',
			'fieldWork.updateComment',
		]);
	});
});

describe('tag items intent map', () => {
	it('reads the link row off column names', () => {
		const command = build(tagItems, 'fieldWork.assignTag', TAG_ITEM, {
			tag_id: TAG,
			entity_type: 'service_request',
			entity_id: SERVICE_REQUEST,
		});

		expect(command.type).toBe('fieldWork.assignTag');
		expect(command.payload).toMatchObject({
			tagItemId: TAG_ITEM,
			tagId: TAG,
			target: { type: 'serviceRequest', id: SERVICE_REQUEST },
		});
	});

	it('refuses a target a Tag does not go on', () => {
		// A Trap Collection takes comments and takes a crew. It does not take Tags,
		// and that narrower list is the domain's, not the reader's.
		expect(() =>
			build(tagItems, 'fieldWork.assignTag', TAG_ITEM, {
				tag_id: TAG,
				entity_type: 'collection',
				entity_id: COLLECTION,
			}),
		).toThrow(DomainValidationError);
	});

	it('refuses an assignment naming no Tag', () => {
		// Read under the wrong key the tag id is absent, which would otherwise be a
		// link row pointing at a record and at nothing.
		expect(() =>
			build(tagItems, 'fieldWork.assignTag', TAG_ITEM, {
				tagId: TAG,
				entity_type: 'habitat',
				entity_id: HABITAT,
			}),
		).toThrow(DomainValidationError);
	});

	it('unassigns by the link row id alone', () => {
		// Which record the Tag was on is what the server looks up, and it is how the
		// ownership check reaches it.
		const command = build(tagItems, 'fieldWork.unassignTag', TAG_ITEM, {
			tag_id: TAG,
			entity_type: 'habitat',
			entity_id: HABITAT,
		});

		expect(command.payload).toEqual({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			tagItemId: TAG_ITEM,
		});
	});

	it('accepts two intents and has no update', () => {
		// A link row carries nothing of its own, so there is nothing to edit.
		expect(Object.keys(tagItems.intents).sort()).toEqual([
			'fieldWork.assignTag',
			'fieldWork.unassignTag',
		]);
	});
});

describe('additional personnel intent map', () => {
	it('reads an Additional Personnel row off column names', () => {
		const command = build(
			additionalPersonnel,
			'fieldWork.addAdditionalPersonnel',
			ADDITIONAL_PERSONNEL,
			{
				entity_type: 'source_reduction',
				entity_id: SOURCE_REDUCTION,
				personnel_profile_id: PROFILE,
			},
		);

		expect(command.type).toBe('fieldWork.addAdditionalPersonnel');
		expect(command.payload).toMatchObject({
			additionalPersonnelId: ADDITIONAL_PERSONNEL,
			target: { type: 'sourceReduction', id: SOURCE_REDUCTION },
			personnelProfileId: PROFILE,
		});
	});

	it('refuses an Additional Personnel row on a record nobody works', () => {
		// The crew is attached to field work. A Habitat is a place, not a record of
		// somebody having been there.
		expect(() =>
			build(additionalPersonnel, 'fieldWork.addAdditionalPersonnel', ADDITIONAL_PERSONNEL, {
				entity_type: 'habitat',
				entity_id: HABITAT,
				personnel_profile_id: PROFILE,
			}),
		).toThrow(DomainValidationError);
	});

	it('refuses an Additional Personnel row naming nobody', () => {
		expect(() =>
			build(additionalPersonnel, 'fieldWork.addAdditionalPersonnel', ADDITIONAL_PERSONNEL, {
				entity_type: 'collection',
				entity_id: COLLECTION,
				personnelProfileId: PROFILE,
			}),
		).toThrow(DomainValidationError);
	});

	it('removes by the link row id alone', () => {
		const command = build(
			additionalPersonnel,
			'fieldWork.removeAdditionalPersonnel',
			ADDITIONAL_PERSONNEL,
			{
				entity_type: 'collection',
				entity_id: COLLECTION,
			},
		);

		expect(command.payload).toEqual({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			additionalPersonnelId: ADDITIONAL_PERSONNEL,
		});
	});

	it('accepts two intents and has no update', () => {
		// A Profile either worked the record or did not, so a form that changes the
		// crew is an add and a remove.
		expect(Object.keys(additionalPersonnel.intents).sort()).toEqual([
			'fieldWork.addAdditionalPersonnel',
			'fieldWork.removeAdditionalPersonnel',
		]);
	});
});
