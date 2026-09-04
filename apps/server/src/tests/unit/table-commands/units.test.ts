/**
 * The unit catalog, as a translation and as two refusals.
 *
 * `units` is the third operator table and the last `/admin/*` write surface to
 * retire. Three things are worth testing: that the map reads Postgres column
 * names, that `code` — the key `unit-conversion.ts` matches on — cannot be
 * changed by accident, and that the two constraint classes this table actually
 * hits come back as refusals a person can read rather than as a 500.
 */

import type { DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import { CommandError } from '../../../command-endpoint.js';
import type { CommandTable } from '../../../command-payload.js';
import type { CommandTransaction, WritableCommand } from '../../../command-write.js';
import type {
	OperatorIntentRequest,
	OperatorTableCommands,
} from '../../../table-commands/dispatch.js';
import { unitTableCommands } from '../../../table-commands/units.js';

const OPERATOR_USER = '11111111-1111-4111-8111-111111111111';
const ROW = '22222222-2222-4222-8222-222222222222';
const ORG = '33333333-3333-4333-8333-333333333333';

const units = unitTableCommands(undefined as never);

function request(payload: Record<string, unknown>): OperatorIntentRequest<CommandTable, string> {
	return { payload, operatorUserId: OPERATOR_USER, operatorContext: {} as never, id: ROW };
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

describe('units intent map', () => {
	it('reads a unit off column names, with no organization anywhere', () => {
		const command = build(
			units,
			'foundation.createUnit',
			request({
				code: 'gal',
				unit_name: 'gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'us_customary',
			}),
		);

		expect(command.payload).toMatchObject({
			operatorUserId: OPERATOR_USER,
			unitId: ROW,
			code: 'gal',
			unitName: 'gallon',
			abbreviation: 'gal',
			unitType: 'volume',
			unitSystem: 'us_customary',
		});
		expect(command.payload).not.toHaveProperty('organizationId');
		expect(command.payload).not.toHaveProperty('actorProfileId');
	});

	it('changes only the field an edit named', () => {
		const command = build(units, 'foundation.updateUnit', request({ abbreviation: 'gal.' }));

		expect(command.payload).toMatchObject({ changes: { abbreviation: 'gal.' } });
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('code');
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('unitName');
	});

	/*
	 * `code` is not a label — it is what `organization-settings/unit-conversion.ts`
	 * matches a unit by, so renaming one detaches it from every total that crosses
	 * units. That does not fail; the total simply stops being available. The domain
	 * guards it, and only when `code` is among the changes.
	 */
	it('refuses a code change the caller withheld acknowledgement for', () => {
		// On the issue path, not the message: `DomainValidationError.message` only
		// names the command, so matching it would pass on any refusal at all.
		let refused: readonly string[] = [];
		try {
			build(
				units,
				'foundation.updateUnit',
				request({ code: 'gallon_us', acknowledgedUnitCodeChange: false }),
			);
		} catch (error) {
			refused = (error as DomainValidationError).issues.map((issue) => issue.path);
		}

		expect(refused).toContain('acknowledgedUnitCodeChange');
	});

	it('takes an absent acknowledgement as confirmed, as every other one does', () => {
		const command = build(units, 'foundation.updateUnit', request({ code: 'gallon_us' }));

		expect(command.payload).toMatchObject({
			changes: { code: 'gallon_us' },
			acknowledgedUnitCodeChange: true,
		});
	});

	it('does not demand it for an edit that leaves the code alone', () => {
		expect(() =>
			build(units, 'foundation.updateUnit', request({ unit_name: 'US gallon' })),
		).not.toThrow();
	});
});

/** What `pg` throws for the two constraint classes this table actually hits. */
function pgError(code: string): Error {
	return Object.assign(new Error(`constraint violation ${code}`), { code });
}

/**
 * A query chain that fails, whichever builder shape the writer reaches for.
 *
 * `selectFrom` is separate and does not fail, because the unit delete reads
 * every agency's `unitDefaults` before it deletes (#131). `chosen` is what that
 * read finds: false lets the delete statement run and raise the error under
 * test, true is an agency holding the unit as a default.
 */
function failingTransaction(error: unknown, chosen = false): CommandTransaction {
	const chain = {
		values: () => chain,
		set: () => chain,
		where: () => chain,
		returning: () => chain,
		executeTakeFirst: () => Promise.reject(error),
		executeTakeFirstOrThrow: () => Promise.reject(error),
	};
	const settingsRead = {
		select: () => settingsRead,
		where: () => settingsRead,
		limit: () => settingsRead,
		execute: () => Promise.resolve(chosen ? [{ id: ORG }] : []),
		executeTakeFirst: () => Promise.resolve(chosen ? { id: ORG } : undefined),
	};
	return {
		insertInto: () => chain,
		updateTable: () => chain,
		deleteFrom: () => chain,
		selectFrom: () => settingsRead,
	} as unknown as CommandTransaction;
}

async function refusal(
	command: WritableCommand,
	error: unknown,
	options: { readonly chosen?: boolean } = {},
): Promise<unknown> {
	return units.run
		.write(failingTransaction(error, options.chosen ?? false), command as never)
		.catch((thrown: unknown) => thrown);
}

/**
 * `code`, `unit_name` and `abbreviation` each carry a unique index and the
 * foreign keys refuse a unit still measured in, so `23505` and `23503` are both
 * routine answers here rather than exceptional ones. Unhandled, each is a 500
 * with a plain-text body — which the console can only report as "Server response
 * was unreadable" about a rule it had just explained.
 */
describe('a unit write the database refuses', () => {
	it('answers 409 for a duplicate code, name, or abbreviation', async () => {
		const command = build(
			units,
			'foundation.createUnit',
			request({
				code: 'gal',
				unit_name: 'gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'us_customary',
			}),
		);

		const failure = await refusal(command, pgError('23505'));

		expect(failure).toBeInstanceOf(CommandError);
		expect((failure as CommandError).status).toBe(409);
		expect((failure as CommandError).body.error).toBe('unit_already_exists');
	});

	it('answers 409 for a unit something still measures in', async () => {
		const command = build(units, 'foundation.deleteUnit', request({}));

		const failure = await refusal(command, pgError('23503'));

		expect(failure).toBeInstanceOf(CommandError);
		expect((failure as CommandError).status).toBe(409);
		expect((failure as CommandError).body.error).toBe('unit_in_use');
	});

	/*
	 * The refusals are per-code, not per-table. A delete that hit a unique index
	 * would be nonsense, and translating it as "already exists" would send an
	 * operator looking for a row that is not the problem.
	 */
	it('does not translate a code the write did not declare a refusal for', async () => {
		const command = build(units, 'foundation.deleteUnit', request({}));
		const wrongClass = pgError('23505');

		expect(await refusal(command, wrongClass)).toBe(wrongClass);
	});

	it('lets an unrelated failure through as itself', async () => {
		const command = build(units, 'foundation.deleteUnit', request({}));
		const dropped = new Error('connection terminated');

		expect(await refusal(command, dropped)).toBe(dropped);
	});
});

/**
 * #131: a unit an agency has merely *chosen* has no foreign key to refuse it.
 * Nine columns reference `units` by key and all nine are records; the agency's
 * `unitDefaults` holds unit **codes in a JSON document**, so Postgres cannot
 * help and the delete used to succeed with the agency's default naming nothing.
 *
 * The stub answers the settings read, so these test which answer the read
 * produces rather than the SQL that produces it. The SQL is covered against
 * Postgres by the delete-policy integration suite.
 */
describe('deleting a unit an agency has chosen as a default', () => {
	it('answers 409 before the delete statement runs', async () => {
		const command = build(units, 'foundation.deleteUnit', request({}));

		const failure = await refusal(command, pgError('23503'), { chosen: true });

		expect(failure).toBeInstanceOf(CommandError);
		expect((failure as CommandError).status).toBe(409);
		expect((failure as CommandError).body.error).toBe('unit_in_use');
	});

	it('says the same thing a foreign key would', async () => {
		const command = build(units, 'foundation.deleteUnit', request({}));

		const chosen = (await refusal(command, pgError('23503'), {
			chosen: true,
		})) as CommandError;
		const referenced = (await refusal(command, pgError('23503'))) as CommandError;

		// The operator is told the same thing either way. Which of the two rules
		// caught it is ours to know and not theirs to act on.
		expect(chosen.body).toEqual(referenced.body);
	});

	it('lets the delete through when no agency has chosen it', async () => {
		const command = build(units, 'foundation.deleteUnit', request({}));

		// `refusal` hands the delete a failure, so reaching it at all is the
		// assertion: the settings check did not refuse first.
		const failure = await refusal(command, new Error('reached the delete'));

		expect(failure).toEqual(new Error('reached the delete'));
	});
});
