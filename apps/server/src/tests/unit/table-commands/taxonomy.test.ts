/**
 * The two operator tables, and the door they sit behind.
 *
 * `genera` and `species` are the global taxonomy: no `organization_id`, read by
 * every agency. They are the first tables on `/commands/{table}` whose commands
 * are not agency commands — the domain types them on `{ operatorUserId }` — so
 * what is under test is both the translation and the thing that keeps the two
 * kinds of table from being confused for each other.
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthVariables } from '../../../auth-middleware.js';
import type { WritableCommand } from '../../../command-write.js';
import {
	type OperatorIntentRequest,
	type OperatorTableCommands,
	registerTableCommandRoutes,
} from '../../../table-commands/dispatch.js';
import { genusTableCommands, speciesTableCommands } from '../../../table-commands/taxonomy.js';

const OPERATOR_USER = '11111111-1111-4111-8111-111111111111';
const ROW = '22222222-2222-4222-8222-222222222222';
const GENUS = '33333333-3333-4333-8333-333333333333';

const genera = genusTableCommands(undefined as never);
const species = speciesTableCommands(undefined as never);

function request(payload: Record<string, unknown>): OperatorIntentRequest {
	return {
		payload,
		operatorUserId: OPERATOR_USER,
		operatorContext: {} as never,
		id: ROW,
	};
}

function build<TCommand extends WritableCommand>(
	spec: OperatorTableCommands<TCommand, unknown>,
	intent: string,
	intentRequest: OperatorIntentRequest,
): TCommand {
	const builder = spec.intents[intent as never] as
		| ((r: OperatorIntentRequest) => TCommand)
		| undefined;
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

describe('the operator door', () => {
	it('refuses to register a table whose commands are not operator-scoped', () => {
		// The failure this prevents is a route whose authorization does not match
		// its door: an agency command served behind operator middleware would be
		// reachable by any operator regardless of the floor its own map states.
		const wrong: OperatorTableCommands<never, unknown> = {
			table: 'habitats',
			actor: 'operator',
			run: {} as never,
			intents: { 'larvalSurveillance.createHabitat': (() => {}) as never },
		};

		expect(() =>
			registerTableCommandRoutes(
				new Hono<{ Variables: AuthVariables }>(),
				{
					authContextMiddleware: (async (_c: unknown, next: () => Promise<void>) =>
						await next()) as never,
					operatorAuthContextMiddleware: (async (_c: unknown, next: () => Promise<void>) =>
						await next()) as never,
				},
				wrong,
			),
		).toThrow(/operator table/);
	});

	it('refuses an operator table when the operator middleware was not supplied', () => {
		expect(() =>
			registerTableCommandRoutes(
				new Hono<{ Variables: AuthVariables }>(),
				{
					authContextMiddleware: (async (_c: unknown, next: () => Promise<void>) =>
						await next()) as never,
				},
				genera,
			),
		).toThrow(/operator middleware/);
	});
});

describe('genera intent map', () => {
	it('builds from the operator user, with no organization anywhere', () => {
		const command = build(
			genera,
			'foundation.createGenus',
			request({ abbreviation: 'Ae.', name: 'Aedes' }),
		);

		expect(command.payload).toMatchObject({
			operatorUserId: OPERATOR_USER,
			genusId: ROW,
			abbreviation: 'Ae.',
			name: 'Aedes',
		});
		expect(command.payload).not.toHaveProperty('organizationId');
		expect(command.payload).not.toHaveProperty('actorProfileId');
	});

	it('changes only the field an edit named', () => {
		const command = build(genera, 'foundation.updateGenus', request({ name: 'Aedes' }));

		expect(command.payload).toMatchObject({ changes: { name: 'Aedes' } });
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('abbreviation');
	});
});

describe('species intent map', () => {
	it('reads a species off column names', () => {
		const command = build(
			species,
			'foundation.createSpecies',
			request({
				genus_id: GENUS,
				epithet: 'albopictus',
				common_name: 'Asian tiger mosquito',
				display_name: 'Aedes albopictus',
			}),
		);

		expect(command.payload).toMatchObject({
			operatorUserId: OPERATOR_USER,
			speciesId: ROW,
			genusId: GENUS,
			epithet: 'albopictus',
			displayName: 'Aedes albopictus',
		});
	});

	it('does not detach a species from its genus on an unrelated edit', () => {
		// The trap in the helper this replaces: `updateSpecies` in `packages/db`
		// sets `genus_id: input.genusId ?? null` unconditionally, so correcting an
		// epithet would have orphaned the species. A command carries `changes`, and
		// an absent `genus_id` is not one.
		const command = build(species, 'foundation.updateSpecies', request({ epithet: 'aegypti' }));

		expect(command.payload).toMatchObject({ changes: { epithet: 'aegypti' } });
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('genusId');
	});
});
