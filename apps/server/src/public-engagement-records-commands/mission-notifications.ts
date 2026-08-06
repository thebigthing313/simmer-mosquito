import { sql } from '@simmer-mosquito/db';
import {
	completeMissionNotificationCommand,
	failMissionNotificationCommand,
	type PublicEngagementCommand,
	reopenMissionNotificationCommand,
	skipMissionNotificationCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import {
	agencyCommandContext,
	createCommand,
	handleCommandError,
	missionNotificationReturnColumns,
	type PublicEngagementTransaction,
	type RouteOptions,
	readDate,
	readJsonObject,
	type SafeMissionNotification,
	toSafeMissionNotification,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Mission notifications (status transitions)
// ===========================================================================

export function registerMissionNotificationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.patch(
		'/public-engagement/mission-notifications/:missionNotificationId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const missionNotificationId = context.req.param('missionNotificationId');
			const status = readText(raw.payload.status);
			const statusChangedAt = readDate(raw.payload.statusChangedAt);
			const build = () => {
				const base = {
					...ctx,
					missionNotificationId,
					...(statusChangedAt === null ? {} : { statusChangedAt }),
				};
				switch (status) {
					case 'completed':
						return completeMissionNotificationCommand(base);
					case 'failed':
						return failMissionNotificationCommand(base);
					case 'skipped':
						return skipMissionNotificationCommand(base);
					default:
						return reopenMissionNotificationCommand(base);
				}
			};
			const result = createCommand(build);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			try {
				const writeResult = await writeCommands(
					options.db,
					[result.command],
					writeMissionNotificationCommand,
				);
				if (writeResult.row === null) {
					return context.json({ error: 'mission_notification_not_found' }, 404);
				}
				return context.json({ missionNotification: writeResult.row, txid: writeResult.txid });
			} catch (error) {
				return handleCommandError(context, error);
			}
		},
	);
}

async function writeMissionNotificationCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<SafeMissionNotification | null> {
	const statusByType: Record<string, 'completed' | 'failed' | 'skipped' | 'pending'> = {
		'publicEngagement.completeMissionNotification': 'completed',
		'publicEngagement.failMissionNotification': 'failed',
		'publicEngagement.skipMissionNotification': 'skipped',
		'publicEngagement.reopenMissionNotification': 'pending',
	};
	const status = statusByType[command.type];
	if (
		status === undefined ||
		!('missionNotificationId' in command.payload) ||
		!('statusChangedAt' in command.payload)
	) {
		throw new Error(`Unsupported mission notification command: ${command.type}`);
	}
	const payload = command.payload as {
		readonly missionNotificationId: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
		readonly statusChangedAt: Date | null;
	};
	const row = await trx
		.updateTable('mission_notifications')
		.set({
			status,
			status_changed_at: payload.statusChangedAt === null ? sql`now()` : payload.statusChangedAt,
			status_changed_by_profile_id: payload.actorProfileId,
			updated_by_profile_id: payload.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', payload.missionNotificationId)
		.where('organization_id', '=', payload.organizationId)
		.where('deleted_at', 'is', null)
		.returning(missionNotificationReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeMissionNotification(row);
}
