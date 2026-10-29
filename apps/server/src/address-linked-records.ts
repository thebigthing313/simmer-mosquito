import {
	addressExistsInOrganization,
	getOrganizationSettingsRaw,
	type Kysely,
	listAddressLinkedRecords,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { uuidPattern } from './map-tiles.js';

/**
 * The three reads the route makes, injectable so a suite can drive it without
 * a database, the way the nearby route takes its `readers`.
 */
const defaultLinkedRecordReaders = {
	addressExistsInOrganization,
	getOrganizationSettings: getOrganizationSettingsRaw,
	listAddressLinkedRecords,
};

type LinkedRecordReaders = typeof defaultLinkedRecordReaders;

/**
 * Reads the Address page's Linked Records: every record in the Organization
 * whose `address_id` names the Address, as one page per family, each the
 * newest 25 and the family's total.
 *
 * It is the nearby read's address-scoped sibling. The Organization is the
 * session's, as it is there, and the Address must be one of its own before
 * anything else is read: an id from another Organization answers 404 rather
 * than an empty list, which is what the service request route answers for a
 * request it cannot see. The zone is the Organization's setting, because a
 * record dated by an instant lists on the day it fell on there.
 *
 * Nothing in the query narrows the read. The families are the domain's whole
 * list, and the cap is the reader's, named in the answer so the page never
 * spells the number.
 */
export function registerAddressLinkedRecordRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: Kysely<SimmerDatabase>;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly readers?: Partial<LinkedRecordReaders>;
	},
): void {
	const readers: LinkedRecordReaders = { ...defaultLinkedRecordReaders, ...options.readers };

	app.get('/records/address/:id/linked-records', options.authContextMiddleware, async (context) => {
		const organizationId = context.get('authContext').organization.id;
		const addressId = context.req.param('id');
		if (!uuidPattern.test(addressId)) {
			return context.json({ error: 'invalid_id', reason: 'Address id must be a UUID.' }, 400);
		}

		if (!(await readers.addressExistsInOrganization(options.db, { organizationId, addressId }))) {
			return context.json({ error: 'not_found', reason: 'Address not found.' }, 404);
		}

		const settings = resolveOrganizationSettings(
			await readers.getOrganizationSettings(options.db, { organizationId }),
		).settings;

		const { families, limit } = await readers.listAddressLinkedRecords(options.db, {
			organizationId,
			addressId,
			timeZone: settings.timezone,
		});

		return context.json({ addressId, families, limit });
	});
}
