/**
 * The two operator tables, and the door they sit behind.
 *
 * `genera` and `species` are the global taxonomy: no `organization_id`, read by
 * every organization. They are the first tables on `/commands/{table}` whose
 * commands are not organization commands — the domain types them on `{
 * operatorUserId }` — so what is under test is both the translation and the
 * thing that keeps the two kinds of table from being confused for each other.
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthVariables } from '../../../auth-middleware.js';
import { CommandError } from '../../../command-endpoint.js';
import type { CommandTable } from '../../../command-payload.js';
import type { CommandTransaction, WritableCommand } from '../../../command-write.js';
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

function request(payload: Record<string, unknown>): OperatorIntentRequest<CommandTable, string> {
	return {
		payload,
		operatorUserId: OPERATOR_USER,
		operatorContext: {} as never,
		id: ROW,
	};
}

function build<TCommand extends WritableCommand>(
	spec: OperatorTableCommands<CommandTable, TCommand, unknown, string>,
	intent: string,
	intentRequest: OperatorIntentRequest<CommandTable, string>,
): TCommand {
	const builder = spec.intents[intent as never] as
		| ((r: OperatorIntentRequest<CommandTable, string>) => TCommand)
		| undefined;
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

describe('the operator door', () => {
	it('refuses to register a table whose commands are not operator-scoped', () => {
		// The failure this prevents is a route whose authorization does not match
		// its door: an organization command served behind operator middleware would
		// be reachable by any operator regardless of the floor its own map states.
		const wrong: OperatorTableCommands<CommandTable, never, unknown, string> = {
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

	it('reads a species off column names, not the domain vocabulary', () => {
		// `genusId` and `displayName` are what the domain calls these; the body
		// speaks Postgres, so neither is read and the command comes back empty
		// enough for the domain to refuse it.
		expect(() =>
			build(
				species,
				'foundation.createSpecies',
				request({ genusId: GENUS, epithet: 'albopictus', displayName: 'Aedes albopictus' }),
			),
		).toThrow();
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

/** What `pg` throws when a delete would orphan a row. */
function foreignKeyViolation(): Error {
	return Object.assign(new Error('update or delete on table violates foreign key constraint'), {
		code: '23503',
	});
}

/** A `deleteFrom(…).where(…).returning(…).executeTakeFirst()` chain that fails. */
function failingTransaction(error: unknown): CommandTransaction {
	const chain = {
		where: () => chain,
		returning: () => chain,
		executeTakeFirst: () => Promise.reject(error),
	};
	return { deleteFrom: () => chain } as unknown as CommandTransaction;
}

/**
 * The taxonomy is hard-deleted and the foreign keys are what refuse it.
 *
 * Every other table on this surface is soft-deleted and settles this before
 * writing, in `applyRecordDeletion`, so its refusal is a `RecordDeleteBlockedError`
 * raised by a read. These two only find out once the statement has run, and left
 * unhandled that arrives as a 500 with a plain-text body — which the console can
 * only report as "Server response was unreadable", about a rule its own
 * confirmation dialog had just explained.
 */
describe('a taxonomy delete the database refuses', () => {
	const cases = [
		{ what: 'genus', spec: genera, intent: 'foundation.deleteGenus', code: 'genus_in_use' },
		{ what: 'species', spec: species, intent: 'foundation.deleteSpecies', code: 'species_in_use' },
	] as const;

	for (const { what, spec, intent, code } of cases) {
		it(`answers 409 and names the rule for a ${what} still in use`, async () => {
			const command = build(spec as never, intent, request({}));

			const failure = await spec.run
				.write(failingTransaction(foreignKeyViolation()), command as never)
				.catch((error: unknown) => error);

			expect(failure).toBeInstanceOf(CommandError);
			expect((failure as CommandError).status).toBe(409);
			expect((failure as CommandError).body.error).toBe(code);
			// The reason is what the operator reads, so it has to say something.
			expect((failure as CommandError).body.reason?.length ?? 0).toBeGreaterThan(10);
		});

		// Dressing an unrelated failure up as a 409 would tell the operator their
		// catalog is in use when the database merely fell over.
		it(`lets an unrelated ${what} failure through as itself`, async () => {
			const command = build(spec as never, intent, request({}));
			const dropped = new Error('connection terminated');

			const failure = await spec.run
				.write(failingTransaction(dropped), command as never)
				.catch((error: unknown) => error);

			expect(failure).toBe(dropped);
		});
	}
});
