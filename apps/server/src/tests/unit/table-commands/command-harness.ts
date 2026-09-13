/**
 * The request and the builder call every `table-commands` suite was writing out.
 *
 * A translation test does two things before it can assert anything: it makes an
 * `IntentRequest` over a mock `AuthContext`, and it reaches into a spec's
 * `intents` map for the builder the intent names. Seventeen suites wrote both,
 * and the only thing that differed between them was the role in the auth
 * context and whether the row id was fixed or passed per case. So the request
 * was the same eleven lines seventeen times and the builder the same eight,
 * which a migration to the shape of either would have had to edit in seventeen
 * places.
 *
 * This sits beside the suites the way `dispatch-harness.ts` sits beside the
 * mutation-hook suites. A suite names its role once, and every case still says
 * at its own call site which row it built against and what payload it sent:
 * `build` takes the request, and `buildFor` takes the id and the payload when
 * the case is about a particular row.
 *
 * It is not a `.test.ts`, so vitest does not collect it, and it exports no
 * assertion: what is under test stays in the suites.
 */

import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { OrganizationCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import type {
	IntentRequest,
	OperatorIntentRequest,
	OperatorTableCommands,
	TableCommands,
} from '../../../table-commands/dispatch.js';

/** The Organization every organization-scoped case writes into. */
export const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
/** The Profile every organization-scoped write is attributed to. */
export const ACTOR = '22222222-2222-4222-8222-222222222222';
/** The row a case writes when it does not name one of its own. */
export const ROW = '33333333-3333-4333-8333-333333333333';

/** The operator behind an operator-scoped case, and the row it writes. */
export const OPERATOR_USER = '11111111-1111-4111-8111-111111111111';
export const OPERATOR_ROW = '22222222-2222-4222-8222-222222222222';

/** What a case may say about the request the harness is otherwise filling in. */
export interface RequestOverrides {
	/** The row this write names, when the case is about a particular one. */
	readonly id?: string;
	/** `organization.settings`, for the builders that read an Organization setting. */
	readonly settings?: unknown;
	/** `authContext.timeZone`, for the builders that date a row in the Organization's zone. */
	readonly timeZone?: string;
}

/** A suite's own answers, which every request it makes carries. */
export interface OrganizationHarnessOptions {
	/** The role in the mock auth context. Suites differ on this and on nothing else. */
	readonly role: string;
	/** The default `authContext.timeZone`, for a suite whose whole surface is dated. */
	readonly timeZone?: string;
	/** The row id a case gets when it names none. */
	readonly id?: string;
}

export interface OrganizationHarness {
	/** One request, with the suite's role and any override the case states. */
	request(
		payload: Record<string, unknown>,
		overrides?: RequestOverrides,
	): IntentRequest<CommandTable, string>;
	/** The same, with the row read first, for a suite whose cases each name their own. */
	requestFor(
		id: string,
		payload: Record<string, unknown>,
		overrides?: Omit<RequestOverrides, 'id'>,
	): IntentRequest<CommandTable, string>;
	/** The command the intent builds from a request the case made. */
	build<TCommand extends WritableCommand>(
		spec: TableCommands<CommandTable, TCommand, unknown, string>,
		intent: OrganizationCommandType,
		intentRequest: IntentRequest<CommandTable, string>,
	): TCommand;
	/** The same, for a case whose subject is one row: the id reads at the call site. */
	buildFor<TCommand extends WritableCommand>(
		spec: TableCommands<CommandTable, TCommand, unknown, string>,
		intent: OrganizationCommandType,
		id: string,
		payload: Record<string, unknown>,
	): TCommand;
}

export function organizationHarness(options: OrganizationHarnessOptions): OrganizationHarness {
	function request(
		payload: Record<string, unknown>,
		overrides: RequestOverrides = {},
	): IntentRequest<CommandTable, string> {
		const timeZone = overrides.timeZone ?? options.timeZone;

		return {
			payload,
			organization: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
			authContext: {
				organization: { id: ORGANIZATION, settings: overrides.settings ?? null },
				profile: { id: ACTOR },
				role: options.role,
				...(timeZone === undefined ? {} : { timeZone }),
			} as unknown as AuthContext,
			id: overrides.id ?? options.id ?? ROW,
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

	return {
		request,
		requestFor: (id, payload, overrides = {}) => request(payload, { ...overrides, id }),
		build,
		buildFor: (spec, intent, id, payload) => build(spec, intent, request(payload, { id })),
	};
}

export interface OperatorHarness {
	request(
		payload: Record<string, unknown>,
		overrides?: Pick<RequestOverrides, 'id'>,
	): OperatorIntentRequest<CommandTable, string>;
	build<TCommand extends WritableCommand>(
		spec: OperatorTableCommands<CommandTable, TCommand, unknown, string>,
		intent: string,
		intentRequest: OperatorIntentRequest<CommandTable, string>,
	): TCommand;
}

/**
 * The operator half, which is a different request rather than a different role.
 *
 * `genera`, `species` and `units` have no `organization_id`, so their builders
 * are typed on `{ operatorUserId }` and there is no auth context to mock. The
 * two halves stay apart for that reason: one harness taking an optional
 * organization would hand every operator case a field its builder cannot read.
 */
export function operatorHarness(): OperatorHarness {
	function request(
		payload: Record<string, unknown>,
		overrides: Pick<RequestOverrides, 'id'> = {},
	): OperatorIntentRequest<CommandTable, string> {
		return {
			payload,
			operatorUserId: OPERATOR_USER,
			operatorContext: {} as never,
			id: overrides.id ?? OPERATOR_ROW,
		};
	}

	function build<TCommand extends WritableCommand>(
		spec: OperatorTableCommands<CommandTable, TCommand, unknown, string>,
		intent: string,
		intentRequest: OperatorIntentRequest<CommandTable, string>,
	): TCommand {
		const builder = spec.intents[intent as never] as
			| ((operatorRequest: OperatorIntentRequest<CommandTable, string>) => TCommand)
			| undefined;
		if (builder === undefined) {
			throw new Error(`${spec.table} does not accept ${intent}.`);
		}
		return builder(intentRequest);
	}

	return { request, build };
}
