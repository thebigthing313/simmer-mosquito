import { type RawBuilder, sql, type Transaction } from 'kysely';

import type { SimmerDatabase } from '../index.js';

/**
 * Who has to be told before a mission runs, worked out from current state.
 *
 * Every other public-engagement command writes one row the caller named. This
 * one names a mission and the server derives the rows: which registrations the
 * mission's stops fall inside, which of those people are still subscribed to the
 * mission's notification type, and which ways of reaching them are actually
 * usable. `docs/public-engagement-domain.md`, "Mission Notifications", is the
 * spec, and this is the whole of it in one statement.
 *
 * V1 mission notifications are a worklist. Nothing here sends an email or a
 * text; it decides what somebody has to do by hand and records it as pending.
 *
 * ## Why it is one statement
 *
 * Regeneration is expected — stops move, people subscribe, a mission gets
 * rescheduled — and the spec is that existing rows are never mutated by it. That
 * is exactly what `mission_notifications_mission_registration_channel_unique`
 * says, so `on conflict … do nothing` is both the rule and the race guard. Two
 * operators pressing the button at once produce one set of rows, not two, and
 * neither of them gets an error.
 *
 * Reading candidates out and inserting them back would need the same guard
 * anyway, and would decide eligibility against a mission somebody could edit in
 * between.
 *
 * ## Why the units come in as an argument
 *
 * A registration's catchment is `buffer_distance` in `buffer_unit_id`, and the
 * factor that turns that into metres lives in `packages/domain`, keyed by unit
 * code — the `units` table deliberately carries no factor. `packages/db` cannot
 * import the domain, so the caller resolves the factors and passes them, and
 * they arrive as a joinable set rather than as arithmetic baked into the SQL.
 */

/** How many metres one of a unit is, for the units a registration might use. */
export interface UnitMetres {
	readonly unitId: string;
	readonly metresPerUnit: number;
}

export interface GenerateMissionNotificationsInput {
	readonly missionId: string;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	/**
	 * Every distance unit the agency's registrations name, in metres.
	 *
	 * A unit missing from this list is a refusal, not a default. See
	 * `requireConvertibleBufferUnits`.
	 */
	readonly unitMetres: readonly UnitMetres[];
}

/** One notification the generation created. */
export interface GeneratedMissionNotification {
	readonly id: string;
	readonly notificationRegistrationId: string;
	readonly contactId: string;
	readonly channel: string;
	readonly destination: string | null;
}

export interface GenerateMissionNotificationsResult {
	readonly missionId: string;
	readonly notificationTypeId: string;
	/**
	 * False when the mission's notification type is retired or deleted.
	 *
	 * Not a refusal: the spec's refusals are about the mission, and a retired type
	 * is a valid reason for nobody to be eligible. It is reported because "we
	 * generated nothing" and "we generated nothing because the type is retired"
	 * are different things to tell an operator.
	 */
	readonly notificationTypeActive: boolean;
	/** Rows written now. A regeneration that changed nothing answers empty. */
	readonly created: readonly GeneratedMissionNotification[];
}

export type MissionNotificationRefusalReason =
	| 'mission_not_found'
	| 'mission_completed'
	| 'mission_cancelled'
	| 'mission_has_no_items'
	| 'mission_has_no_notification_type'
	| 'buffer_unit_not_convertible';

/**
 * Thrown when the mission is not one notifications can be generated for.
 *
 * `docs/public-engagement-domain.md`: generation is rejected for deleted,
 * completed, cancelled, or itemless missions. A mission with no notification
 * type is the fifth — generated rows snapshot the type, and there is nothing to
 * snapshot.
 */
export class MissionNotificationRefusedError extends Error {
	readonly reason: MissionNotificationRefusalReason;
	readonly missionId: string;
	/**
	 * The unit codes behind a `buffer_unit_not_convertible` refusal, and empty
	 * for every other reason.
	 *
	 * Codes rather than ids, because the thing to fix is a unit somebody chose,
	 * and 'gallon' says which one where a uuid does not.
	 */
	readonly unitCodes: readonly string[];

	constructor(
		reason: MissionNotificationRefusalReason,
		missionId: string,
		message: string,
		unitCodes: readonly string[] = [],
	) {
		super(message);
		this.name = 'MissionNotificationRefusedError';
		this.reason = reason;
		this.missionId = missionId;
		this.unitCodes = unitCodes;
	}
}

/**
 * The units the caller has to price, as they are actually used.
 *
 * Read before generating so the caller can look each code up in the domain's
 * conversion table. Distinct unit ids across this agency's live registrations,
 * which is a much shorter list than the unit catalog.
 */
export async function readRegistrationBufferUnits(
	trx: Transaction<SimmerDatabase>,
	organizationId: string,
): Promise<readonly { readonly unitId: string; readonly unitCode: string }[]> {
	const rows = await trx
		.selectFrom('notification_registrations as r')
		.innerJoin('units as u', 'u.id', 'r.buffer_unit_id')
		.select(['u.id as unitId', 'u.code as unitCode'])
		.where('r.organization_id', '=', organizationId)
		.where('r.deleted_at', 'is', null)
		.distinct()
		.execute();
	return rows;
}

/**
 * The mission's own state, and the reason it cannot be generated for.
 *
 * Read separately from the insert because the answers are different in kind: a
 * refusal names the mission, while the insert reports rows. Doing both in one
 * statement would make an itemless mission indistinguishable from one where
 * nobody lives nearby, and those are opposite things to tell somebody.
 */
async function readMission(
	trx: Transaction<SimmerDatabase>,
	input: GenerateMissionNotificationsInput,
): Promise<{ readonly notificationTypeId: string; readonly notificationTypeActive: boolean }> {
	const mission = await trx
		.selectFrom('missions')
		.select(['notification_type_id', 'completed_at', 'cancelled_at'])
		.where('id', '=', input.missionId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	if (mission === undefined) {
		throw new MissionNotificationRefusedError(
			'mission_not_found',
			input.missionId,
			'The mission was not found.',
		);
	}
	if (mission.completed_at !== null) {
		throw new MissionNotificationRefusedError(
			'mission_completed',
			input.missionId,
			'Notifications cannot be generated for a mission that is already complete.',
		);
	}
	if (mission.cancelled_at !== null) {
		throw new MissionNotificationRefusedError(
			'mission_cancelled',
			input.missionId,
			'Notifications cannot be generated for a cancelled mission.',
		);
	}
	if (mission.notification_type_id === null) {
		throw new MissionNotificationRefusedError(
			'mission_has_no_notification_type',
			input.missionId,
			'The mission has no notification type, so there is nothing for its notifications to record.',
		);
	}

	const items = await trx
		.selectFrom('mission_items')
		.select(['id'])
		.where('mission_id', '=', input.missionId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.limit(1)
		.execute();
	if (items.length === 0) {
		throw new MissionNotificationRefusedError(
			'mission_has_no_items',
			input.missionId,
			'The mission has no stops, so there is nowhere for it to notify anyone about.',
		);
	}

	const type = await trx
		.selectFrom('notification_types')
		.select(['is_active'])
		.where('id', '=', mission.notification_type_id)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	return {
		notificationTypeId: mission.notification_type_id,
		notificationTypeActive: type?.is_active === true,
	};
}

/**
 * Refuse while any registration's catchment cannot be worked out.
 *
 * `buffer_distance` in a unit nothing can price used to fall through
 * `coalesce(distance * metres, 0)` to a zero catchment, which matches only a
 * registration standing exactly on a stop. So a person who asked to be told
 * before spraying within 500 of their house was quietly not told, and the
 * command reported success. In this domain that is the wrong direction to fail
 * in, and nothing about the answer showed it had happened.
 *
 * Nothing constrains `buffer_unit_id` to a distance unit either: the domain
 * checks it is a uuid and that it arrives with a distance, so a volume unit
 * picked from a list reaches here intact.
 *
 * The refusal is agency-wide rather than scoped to this mission, and that is
 * deliberate even though it blocks every mission until somebody fixes the unit.
 * Scoping it would mean deciding which registrations are near enough to matter,
 * which is the question the missing catchment is what stops us answering.
 */
async function requireConvertibleBufferUnits(
	trx: Transaction<SimmerDatabase>,
	input: GenerateMissionNotificationsInput,
): Promise<void> {
	const priced = input.unitMetres.map((unit) => unit.unitId);
	let query = trx
		.selectFrom('notification_registrations as r')
		.innerJoin('units as u', 'u.id', 'r.buffer_unit_id')
		.select(['u.code as code'])
		.distinct()
		.where('r.organization_id', '=', input.organizationId)
		.where('r.deleted_at', 'is', null)
		// A registration with no distance has no catchment to lose, whatever its
		// unit column says.
		.where('r.buffer_distance', 'is not', null);
	if (priced.length > 0) {
		query = query.where('u.id', 'not in', priced);
	}

	const rows = await query.execute();
	if (rows.length === 0) {
		return;
	}

	const codes = rows.map((row) => row.code).sort();
	throw new MissionNotificationRefusedError(
		'buffer_unit_not_convertible',
		input.missionId,
		codes.length === 1
			? `A notification registration measures its buffer in ${codes[0]}, which cannot be converted to a distance.`
			: `Some notification registrations measure their buffer in units that cannot be converted to a distance: ${codes.join(', ')}.`,
		codes,
	);
}

/**
 * The unit factors as a joinable relation.
 *
 * An empty list still has to be a relation with the right column types, or the
 * left join below is a syntax error rather than a no-match — hence the
 * `where false` arm.
 */
function unitMetresRelation(unitMetres: readonly UnitMetres[]): RawBuilder<unknown> {
	if (unitMetres.length === 0) {
		return sql`select null::uuid as unit_id, null::double precision as metres_per_unit where false`;
	}
	return sql.join(
		unitMetres.map(
			(unit) =>
				sql`select ${unit.unitId}::uuid as unit_id, ${unit.metresPerUnit}::double precision as metres_per_unit`,
		),
		sql` union all `,
	);
}

/**
 * Generate the mission's pending notifications inside the caller's transaction.
 *
 * @throws MissionNotificationRefusedError when the mission is not one that can
 * be generated for.
 */
export async function generateMissionNotifications(
	trx: Transaction<SimmerDatabase>,
	input: GenerateMissionNotificationsInput,
): Promise<GenerateMissionNotificationsResult> {
	const { notificationTypeId, notificationTypeActive } = await readMission(trx, input);
	await requireConvertibleBufferUnits(trx, input);

	const empty = {
		missionId: input.missionId,
		notificationTypeId,
		notificationTypeActive,
	} as const;

	// A retired type has no eligible subscribers by definition, and running the
	// insert would be a long way to write nothing.
	if (!notificationTypeActive) {
		return { ...empty, created: [] };
	}

	const result = await sql<{
		readonly id: string;
		readonly notification_registration_id: string;
		readonly contact_id: string;
		readonly channel: string;
		readonly destination: string | null;
	}>`
		with unit_metres as (${unitMetresRelation(input.unitMetres)})
		insert into mission_notifications (
			organization_id, mission_id, notification_registration_id, contact_id,
			notification_type_id, channel, destination, status,
			created_by_profile_id, updated_by_profile_id
		)
		select
			${input.organizationId}::uuid,
			${input.missionId}::uuid,
			r.id,
			r.contact_id,
			${notificationTypeId}::uuid,
			channels.channel::notification_channel,
			channels.destination,
			'pending',
			${input.actorProfileId}::uuid,
			${input.actorProfileId}::uuid
		from notification_registrations r
		join contacts c
			on c.id = r.contact_id
			and c.organization_id = ${input.organizationId}
			and c.deleted_at is null
		-- The subscription is what makes this person's business this mission's
		-- notification type, and unsubscribing is a soft delete.
		join notification_registration_types nrt
			on nrt.notification_registration_id = r.id
			and nrt.notification_type_id = ${notificationTypeId}
			and nrt.organization_id = ${input.organizationId}
			and nrt.deleted_at is null
		-- One row per way of reaching them that is both wanted and possible. A
		-- preference with nothing to send to is not a channel, so the destination
		-- being null is what drops it.
		cross join lateral (values
			('email', case when c.wants_email then nullif(btrim(c.email), '') end),
			('sms', case when c.wants_sms then nullif(btrim(c.preferred_phone), '') end),
			('phone', case when c.wants_phone then nullif(btrim(c.preferred_phone), '') end)
		) as channels(channel, destination)
		where r.organization_id = ${input.organizationId}
			and r.deleted_at is null
			and r.is_active = true
			and channels.destination is not null
			-- Matched against the stops themselves, not a mission-level geometry:
			-- a mission is wherever its work is. One row per registration and
			-- channel however many stops are in range, which is what the exists
			-- clause gives rather than a join.
			and exists (
				select 1
				from mission_items mi
				left join unit_metres um on um.unit_id = r.buffer_unit_id
				where mi.mission_id = ${input.missionId}
					and mi.organization_id = ${input.organizationId}
					and mi.deleted_at is null
					-- The zero is the domain's "null buffer means exact geometry", and
					-- only that: requireConvertibleBufferUnits has already refused the
					-- case where a real distance would have collapsed into it.
					and st_dwithin(
						r.geom::geography,
						mi.geom::geography,
						coalesce(r.buffer_distance * um.metres_per_unit, 0)
					)
			)
		on conflict (mission_id, notification_registration_id, channel)
			where deleted_at is null
			do nothing
		returning id, notification_registration_id, contact_id, channel::text, destination
	`.execute(trx);

	return {
		...empty,
		created: result.rows.map((row) => ({
			id: row.id,
			notificationRegistrationId: row.notification_registration_id,
			contactId: row.contact_id,
			channel: row.channel,
			destination: row.destination,
		})),
	};
}
