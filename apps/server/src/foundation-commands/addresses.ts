import { RecordDeleteBlockedError } from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { type CommandContext, commandEndpoint } from '../command-endpoint.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import { deleteBlockedBody } from '../record-deletion.js';
import {
	type AddressCreatePayload,
	type AddressUpdatePayload,
	type FoundationCommandDb,
	readAddressCreatePayload,
	readAddressUpdatePayload,
	toAddressResponse,
	writeAddressDeleteWithTxid,
	writeAddressUpdateWithTxid,
	writeAddressWithTxid,
} from './shared.js';

/**
 * These three endpoints write their rows directly rather than through the
 * `foundation.*Address` command builders, so there is no command to hand
 * `runCommands` and no domain writer for it to call. What they do carry is the
 * command they implement, named so the permission map still answers for them:
 * "createAddress is collector-and-above so mobile collectors can create ad hoc
 * address book entries while entering field records. Update, delete, and merge
 * are manager-and-above" (`docs/foundation-domain.md`).
 *
 * They share the preamble — body read, typed payload, `invalid_payload` — with
 * every other command endpoint, and only the tail is their own.
 */
export function registerAddressRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/foundation/addresses',
		options.authContextMiddleware,
		commandEndpoint<AddressCommand, AddressCreatePayload>({
			readPayload: readAddressCreatePayload,
			build: ({ payload }) => ({ type: 'foundation.createAddress', payload }),
			run: async (context, commands) => {
				const denial = denyUnauthorizedAgencyCommands(context, commands);
				if (denial !== null) {
					return denial;
				}

				const authContext = context.get('authContext');
				const result = await writeAddressWithTxid(options.db, {
					...(commands[0] as CreateAddressCommand).payload,
					organizationId: authContext.organization.id,
					createdByProfileId: authContext.profile.id,
					updatedByProfileId: authContext.profile.id,
				});

				return context.json({ address: toAddressResponse(result.row), txid: result.txid }, 201);
			},
		}),
	);

	app.patch(
		'/foundation/addresses/:addressId',
		options.authContextMiddleware,
		commandEndpoint<AddressCommand, AddressUpdatePayload>({
			readPayload: readAddressUpdatePayload,
			build: ({ payload }) => ({ type: 'foundation.updateAddressDetails', payload }),
			run: async (context, commands) => {
				const denial = denyUnauthorizedAgencyCommands(context, commands);
				if (denial !== null) {
					return denial;
				}

				const authContext = context.get('authContext');
				const result = await writeAddressUpdateWithTxid(options.db, addressId(context), {
					...(commands[0] as UpdateAddressCommand).payload,
					organizationId: authContext.organization.id,
					updatedByProfileId: authContext.profile.id,
				});

				return answerAddress(context, result);
			},
		}),
	);

	app.delete(
		'/foundation/addresses/:addressId',
		options.authContextMiddleware,
		commandEndpoint<AddressCommand>({
			body: 'none',
			build: () => ({ type: 'foundation.deleteAddress', payload: {} }),
			run: async (context, commands) => {
				const denial = denyUnauthorizedAgencyCommands(context, commands);
				if (denial !== null) {
					return denial;
				}

				const authContext = context.get('authContext');
				try {
					const result = await writeAddressDeleteWithTxid(options.db, addressId(context), {
						organizationId: authContext.organization.id,
						actorProfileId: authContext.profile.id,
					});
					return answerAddress(context, result);
				} catch (error) {
					// An address is kept alive by whatever still names it, so this is the
					// one delete that routinely refuses. Say what is holding it.
					if (error instanceof RecordDeleteBlockedError) {
						return context.json(deleteBlockedBody(error), 409);
					}
					throw error;
				}
			},
		}),
	);
}

type CreateAddressCommand = {
	readonly type: 'foundation.createAddress';
	readonly payload: AddressCreatePayload;
};
type UpdateAddressCommand = {
	readonly type: 'foundation.updateAddressDetails';
	readonly payload: AddressUpdatePayload;
};
type AddressCommand =
	| CreateAddressCommand
	| UpdateAddressCommand
	| { readonly type: 'foundation.deleteAddress'; readonly payload: Record<string, never> };

// Hono widens `param` to `string | undefined` where it cannot see the path;
// `:addressId` is in both paths this is called from.
function addressId(context: CommandContext): string {
	return context.req.param('addressId') as string;
}

function answerAddress(
	context: CommandContext,
	result: { readonly row: Parameters<typeof toAddressResponse>[0] | null; readonly txid: number },
) {
	if (result.row === null) {
		return context.json({ error: 'address_not_found' }, 404);
	}

	return context.json({ address: toAddressResponse(result.row), txid: result.txid });
}
