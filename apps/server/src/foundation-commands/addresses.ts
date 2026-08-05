import { RecordDeleteBlockedError } from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import { deleteBlockedBody } from '../record-deletion.js';
import {
	type FoundationCommandDb,
	readAddressCreatePayload,
	readAddressUpdatePayload,
	toAddressResponse,
	writeAddressDeleteWithTxid,
	writeAddressUpdateWithTxid,
	writeAddressWithTxid,
} from './shared.js';

// --------------------------------------------------------------------------
// Addresses
// --------------------------------------------------------------------------

/**
 * These three endpoints write their rows directly rather than through the
 * `foundation.*Address` command builders, so there is no command object to hand
 * the permission map. They name the command they implement instead, which keeps
 * the answer in the same place as every other endpoint's: "createAddress is
 * collector-and-above so mobile collectors can create ad hoc address book
 * entries while entering field records. Update, delete, and merge are
 * manager-and-above" (`docs/foundation-domain.md`).
 */
export function registerAddressRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/foundation/addresses', options.authContextMiddleware, async (context) => {
		const denial = denyUnauthorizedAgencyCommands(context, [{ type: 'foundation.createAddress' }]);
		if (denial !== null) {
			return denial;
		}

		const payloadResult = await readAddressCreatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const authContext = context.get('authContext');
		const result = await writeAddressWithTxid(options.db, {
			...payloadResult.payload,
			organizationId: authContext.organization.id,
			createdByProfileId: authContext.profile.id,
			updatedByProfileId: authContext.profile.id,
		});

		return context.json({ address: toAddressResponse(result.row), txid: result.txid }, 201);
	});

	app.patch('/foundation/addresses/:addressId', options.authContextMiddleware, async (context) => {
		const denial = denyUnauthorizedAgencyCommands(context, [
			{ type: 'foundation.updateAddressDetails' },
		]);
		if (denial !== null) {
			return denial;
		}

		const payloadResult = await readAddressUpdatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const authContext = context.get('authContext');
		const result = await writeAddressUpdateWithTxid(options.db, context.req.param('addressId'), {
			...payloadResult.payload,
			organizationId: authContext.organization.id,
			updatedByProfileId: authContext.profile.id,
		});
		if (result.row === null) {
			return context.json({ error: 'address_not_found' }, 404);
		}

		return context.json({ address: toAddressResponse(result.row), txid: result.txid });
	});

	app.delete('/foundation/addresses/:addressId', options.authContextMiddleware, async (context) => {
		const denial = denyUnauthorizedAgencyCommands(context, [{ type: 'foundation.deleteAddress' }]);
		if (denial !== null) {
			return denial;
		}

		const authContext = context.get('authContext');
		try {
			const result = await writeAddressDeleteWithTxid(options.db, context.req.param('addressId'), {
				organizationId: authContext.organization.id,
				actorProfileId: authContext.profile.id,
			});
			if (result.row === null) {
				return context.json({ error: 'address_not_found' }, 404);
			}

			return context.json({ address: toAddressResponse(result.row), txid: result.txid });
		} catch (error) {
			// An address is kept alive by whatever still names it, so this is the
			// one delete that routinely refuses. Say what is holding it.
			if (error instanceof RecordDeleteBlockedError) {
				return context.json(deleteBlockedBody(error), 409);
			}
			throw error;
		}
	});
}
