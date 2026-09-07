import { sql } from '@simmer-mosquito/db';
import type { MissionNotificationStatus, PublicEngagementCommand } from '@simmer-mosquito/domain';
import { returnColumns } from '../../return-columns.js';
import type { MissionNotificationRow, PublicEngagementTransaction } from './shared.js';

// ===========================================================================
// Mission notifications (status transitions)
// ===========================================================================

export async function writeMissionNotificationCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<MissionNotificationRow | null> {
	const statusByType: Record<string, MissionNotificationStatus> = {
		'publicEngagement.completeMissionNotification': 'completed',
		'publicEngagement.failMissionNotification': 'failed',
		'publicEngagement.skipMissionNotification': 'skipped',
		'publicEngagement.reopenMissionNotification': 'pending',
	};
	// Two different faults, said differently. Folded together, a command this
	// writer handles perfectly well but was handed a payload it could not read
	// reported itself as one the writer had never heard of — which sends the next
	// reader to the intent map, where nothing is wrong.
	const status = statusByType[command.type];
	if (status === undefined) {
		throw new Error(`Unsupported mission notification command: ${command.type}`);
	}
	if (!('missionNotificationId' in command.payload) || !('statusChangedAt' in command.payload)) {
		throw new Error(
			`${command.type} needs a missionNotificationId and a statusChangedAt to write.`,
		);
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
		.returning(returnColumns.mission_notifications)
		.executeTakeFirst();
	return row ?? null;
}
