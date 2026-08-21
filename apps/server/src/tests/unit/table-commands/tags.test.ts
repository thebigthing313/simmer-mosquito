/**
 * The Tag catalog, as translations.
 *
 * `foundation-commands/tags.ts` decides what a PATCH meant from which keys
 * arrived: `tagName`/`description`/`color` means an update, and `isActive` means
 * activate *or* deactivate depending on which way the boolean points. Both
 * inferences are removed here, and both are the kind that fails quietly — a
 * lifecycle read off a column moves a Tag the wrong way and says nothing, and an
 * update built from a field the caller did not send clears a colour nobody
 * touched.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { AgencyCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { tagTableCommands } from '../../../table-commands/tags.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const TAG = '33333333-3333-4333-8333-333333333333';

function request(payload: Record<string, unknown>): IntentRequest {
	return {
		payload,
		agency: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id: TAG,
	};
}

const tags = tagTableCommands(undefined as never);

function build<TCommand extends WritableCommand>(
	spec: TableCommands<TCommand, unknown>,
	intent: AgencyCommandType,
	payload: Record<string, unknown>,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(request(payload));
}

describe('tag table commands', () => {
	it('creates from the table’s own column names', () => {
		const command = build(tags, 'fieldWork.createTag', {
			tag_name: 'Needs access code',
			description: 'Gate code required before entry',
			color: '#2563EB',
		});

		expect(command.type).toBe('fieldWork.createTag');
		expect(command.payload).toMatchObject({
			tagId: TAG,
			tagName: 'Needs access code',
			description: 'Gate code required before entry',
			// Lower-cased by the domain, which owns the normalization. Worth pinning:
			// the my-organization helper this replaces upper-cased the same value on
			// its way out, so the row on screen and the row in Postgres disagreed on
			// the spelling of every colour until it synced back.
			color: '#2563eb',
		});
	});

	it('reads only the fields an update actually carried', () => {
		// A rename must not claim to have cleared the colour. The domain reads
		// `changes` by key, so a field present-and-undefined and a field absent are
		// the same to it — which is why this asserts on the key set.
		const command = build(tags, 'fieldWork.updateTag', { tag_name: 'Priority' });

		expect(command.payload).toMatchObject({ tagId: TAG, changes: { tagName: 'Priority' } });
		expect(Object.keys((command.payload as { readonly changes: object }).changes)).toEqual([
			'tagName',
		]);
	});

	it('clears a colour only when the caller sent one to clear', () => {
		const cleared = build(tags, 'fieldWork.updateTag', { color: null });

		expect((cleared.payload as { readonly changes: { readonly color?: unknown } }).changes).toEqual(
			{ color: null },
		);
	});

	it('names the lifecycle direction rather than reading is_active', () => {
		// Both directions are their own command, and neither takes the column: a
		// payload carrying `is_active` the other way must not change the answer.
		const retired = build(tags, 'fieldWork.deactivateTag', { is_active: true });
		const restored = build(tags, 'fieldWork.activateTag', { is_active: false });

		expect(retired.type).toBe('fieldWork.deactivateTag');
		expect(restored.type).toBe('fieldWork.activateTag');
		expect(retired.payload).toMatchObject({ tagId: TAG });
		expect(restored.payload).toMatchObject({ tagId: TAG });
	});

	it('deletes by id alone', () => {
		const command = build(tags, 'fieldWork.deleteTag', {});

		expect(command.type).toBe('fieldWork.deleteTag');
		expect(command.payload).toMatchObject({ tagId: TAG, organizationId: ORGANIZATION });
	});

	it('accepts the five catalog commands and nothing else', () => {
		expect(Object.keys(tags.intents).sort()).toEqual([
			'fieldWork.activateTag',
			'fieldWork.createTag',
			'fieldWork.deactivateTag',
			'fieldWork.deleteTag',
			'fieldWork.updateTag',
		]);
	});
});
