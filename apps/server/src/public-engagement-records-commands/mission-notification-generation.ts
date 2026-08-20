/**
 * `publicEngagement.generateMissionNotifications`, and the one route that
 * carries it.
 *
 * The last of the twenty commands the domain declared and nothing wrote (#163).
 * Every other public-engagement write names a row and changes it. This one names
 * a mission and asks the server who has to be told before it runs: the people
 * whose registered catchment the mission's stops fall inside, still subscribed
 * to the mission's notification type, reachable by a channel they asked for.
 * `packages/db`'s `generateMissionNotifications` is the derivation;
 * `docs/public-engagement-domain.md` is the rule it implements.
 *
 * ## Why this is not a table command
 *
 * `TableCommands.intents` maps one row id to one command and `runCommands`
 * answers `{ row, txid }`. Generation is scoped to a mission, writes any number
 * of `mission_notifications` rows, and its answer is the set that was created
 * plus why it might be empty. There is nowhere in that dispatch to put it, which
 * is the same argument `weather-commands/import.ts` makes for the same shape.
 *
 * `POST /commands/mission_notifications/generate` rather than a path under the
 * mission, because the rows it writes are what the client re-reads, and the
 * collection they land in is what names the route.
 *
 * ## The buffer distances are converted here
 *
 * A registration's catchment is a number and a unit id. The factor that turns
 * that into metres lives in `packages/domain`, keyed by unit code, because the
 * `units` table deliberately carries no factor — and `packages/db` cannot import
 * the domain. So this is the layer that can see both: it reads the unit codes
 * the agency's registrations actually use, prices them through
 * `convertUnitAmount`, and hands the result down.
 *
 * A unit the conversion table does not know is reported, not guessed. Those
 * registrations match with no catchment at all, and `units_missing` in the
 * response is what turns "nobody was nearby" into "we could not tell for these",
 * which is the difference between a quiet mission and a missed notification.
 */

import {
	type GenerateMissionNotificationsResult,
	generateMissionNotifications,
	MissionNotificationRefusedError,
	readRegistrationBufferUnits,
	type UnitMetres,
} from '@simmer-mosquito/db';
import {
	convertUnitAmount,
	DomainValidationError,
	type GenerateMissionNotificationsCommand,
	generateMissionNotificationsCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { agencyCommandContext, handleCommandError, readJsonObject } from '../command-endpoint.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import { commandActor, writeCommands } from '../command-write.js';
import type { RouteOptions } from './shared.js';

export function registerMissionNotificationGenerationRoute(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/commands/mission_notifications/generate',
		options.authContextMiddleware,
		async (context) => {
			// Written out rather than assembled by `commandEndpoint`, for the
			// ordering: the role check has to run before the derivation, and the
			// command's name is fixed for this route, so it is known without building
			// anything. Same argument `weather-commands/import.ts` and `dispatch.ts`
			// make.
			const denial = denyUnauthorizedAgencyCommands(context, [
				{ type: 'publicEngagement.generateMissionNotifications' },
			]);
			if (denial !== null) {
				return denial;
			}

			const parsed = await readJsonObject(context.req);
			if (!parsed.ok) {
				return context.json({ error: 'invalid_payload', reason: parsed.reason }, 400);
			}

			const authContext = context.get('authContext');
			let command: GenerateMissionNotificationsCommand;
			try {
				command = generateMissionNotificationsCommand({
					...agencyCommandContext(authContext),
					missionId: readString(parsed.payload.mission_id),
				});
			} catch (error) {
				if (!(error instanceof DomainValidationError)) {
					throw error;
				}
				return context.json(
					{ error: 'invalid_command', message: error.message, issues: error.issues },
					400,
				);
			}

			try {
				const written = await writeCommands(
					options.db,
					commandActor(authContext),
					[command],
					async (trx, one) => {
						const unitMetres = await resolveBufferUnits(trx, one.payload.organizationId);
						return generateMissionNotifications(trx, {
							missionId: one.payload.missionId,
							organizationId: one.payload.organizationId,
							actorProfileId: one.payload.actorProfileId,
							unitMetres,
						});
					},
				);
				return context.json(
					{ ...responseBody(written.row), txid: written.txid },
					written.row === null ? 404 : 200,
				);
			} catch (error) {
				// A refusal names the mission's state, which is something the operator
				// can act on — reschedule, reopen, add a stop — so it comes back as a
				// 409 with the reason rather than a bare failure. A mission they cannot
				// see is a 404, the same answer as one that never existed.
				if (error instanceof MissionNotificationRefusedError) {
					return context.json(
						{
							error: 'mission_notifications_refused',
							reason: error.reason,
							message: error.message,
						},
						error.reason === 'mission_not_found' ? 404 : 409,
					);
				}
				return handleCommandError(context, error);
			}
		},
	);
}

/**
 * The agency's registration buffer units, in metres.
 *
 * Reads the codes actually in use rather than the whole unit catalog, then
 * prices each one. A code the conversion table does not carry, or one that is
 * not a distance at all, is left out — the generation reports it rather than
 * substituting a number.
 */
async function resolveBufferUnits(
	trx: Parameters<typeof readRegistrationBufferUnits>[0],
	organizationId: string,
): Promise<readonly UnitMetres[]> {
	const units = await readRegistrationBufferUnits(trx, organizationId);
	const priced: UnitMetres[] = [];
	for (const unit of units) {
		const metres = convertUnitAmount(1, unit.unitCode, 'meter');
		if (metres !== null) {
			priced.push({ unitId: unit.unitId, metresPerUnit: metres });
		}
	}
	return priced;
}

/** The result as the client reads it: column-shaped keys, like every other write. */
function responseBody(result: GenerateMissionNotificationsResult | null) {
	if (result === null) {
		return { error: 'mission_not_found' };
	}
	return {
		mission_id: result.missionId,
		notification_type_id: result.notificationTypeId,
		notification_type_active: result.notificationTypeActive,
		created: result.created.map((row) => ({
			id: row.id,
			notification_registration_id: row.notificationRegistrationId,
			contact_id: row.contactId,
			channel: row.channel,
			destination: row.destination,
		})),
		units_missing: result.unitsMissing,
	};
}

function readString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}
