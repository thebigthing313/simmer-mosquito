/**
 * Working out who has to be told before a mission runs.
 *
 * `publicEngagement.generateMissionNotifications` names a mission and asks the
 * server for the set of people whose registered catchment its stops fall inside,
 * still subscribed to the mission's notification type, reachable by a channel
 * they asked for. It writes any number of `mission_notifications` rows and
 * answers with the ones it created.
 *
 * ## Its own route, so its own request
 *
 * Not a table command: `TableCommands` maps one row id to one command and
 * answers `{ row, txid }`, and this writes a set. So it goes to
 * `POST /commands/mission_notifications/generate` as a plain request rather than
 * through `mutateCollection` or `commandTransaction`, and the rows arrive back
 * over Electric like any other write.
 *
 * ## An empty answer is not a failure
 *
 * Three of the four things this can say are successes, and the page has to tell
 * them apart. Rows created is the obvious one. Zero created on a second press
 * means nothing changed, which is correct. And a retired notification type means
 * nobody was eligible, which is different again from nobody being nearby.
 * {@link GenerationOutcome} is that distinction made into a value, so the card
 * cannot collapse them into "nothing happened".
 */

import { sessionFetch } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { getServerUrl } from '../../auth';
import { commandErrorFrom, readResponseBody } from '../../sync/command-error';

/** One row the generation wrote. */
export interface GeneratedNotification {
	readonly id: string;
	readonly notification_registration_id: string;
	readonly contact_id: string;
	readonly channel: string;
	readonly destination: string | null;
}

export interface GenerationResult {
	readonly mission_id: string;
	readonly notification_type_id: string;
	/** False when the mission's notification type is retired, so nobody was eligible. */
	readonly notification_type_active: boolean;
	readonly created: readonly GeneratedNotification[];
}

/** Why a generation was refused. Every one but the first is a 409. */
export type GenerationRefusalReason =
	| 'mission_not_found'
	| 'mission_completed'
	| 'mission_cancelled'
	| 'mission_has_no_items'
	| 'mission_has_no_notification_type'
	| 'buffer_unit_not_convertible';

/** One registration the server could not price, as the refusal names it. */
export interface RefusedRegistration {
	readonly registrationId: string;
	readonly contactId: string;
	readonly contactName: string | null;
	readonly unitCode: string;
}

/**
 * A refusal, with the three fields that make one of them actionable.
 *
 * All three are empty on every reason but `buffer_unit_not_convertible`. That
 * refusal is organization-wide: one registration holding a unit the server
 * cannot price in metres blocks generation for every mission until somebody
 * changes it. `unitCodes` names the units, `registrations` names the rows
 * holding them and the contact each one is managed from, and
 * `registrationsNotShown` counts the ones past the server's cap.
 */
export interface GenerationRefusal {
	readonly reason: GenerationRefusalReason;
	readonly message: string;
	readonly unitCodes: readonly string[];
	readonly registrations: readonly RefusedRegistration[];
	readonly registrationsNotShown: number;
}

export function generationRefusalOf(error: unknown): GenerationRefusal | null {
	const body = (error as { readonly body?: unknown } | null)?.body;
	if (typeof body !== 'object' || body === null) {
		return null;
	}
	const record = body as {
		readonly error?: unknown;
		readonly reason?: unknown;
		readonly message?: unknown;
		readonly unitCodes?: unknown;
		readonly registrations?: unknown;
		readonly registrationsNotShown?: unknown;
	};
	if (record.error !== 'mission_notifications_refused' || typeof record.reason !== 'string') {
		return null;
	}
	return {
		reason: record.reason as GenerationRefusalReason,
		message: typeof record.message === 'string' ? record.message : 'Generation was refused.',
		unitCodes: Array.isArray(record.unitCodes)
			? record.unitCodes.filter((code): code is string => typeof code === 'string')
			: [],
		registrations: Array.isArray(record.registrations)
			? record.registrations.filter(isRefusedRegistration)
			: [],
		registrationsNotShown:
			typeof record.registrationsNotShown === 'number' && record.registrationsNotShown > 0
				? record.registrationsNotShown
				: 0,
	};
}

/**
 * A row is kept only when it can be rendered as a link.
 *
 * The contact id is what the row is for, so a row missing one is dropped rather
 * than listed as a dead entry. The name is allowed to be null, because a Contact
 * can be unnamed and the link still goes somewhere.
 */
function isRefusedRegistration(value: unknown): value is RefusedRegistration {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const row = value as Record<string, unknown>;
	return (
		typeof row.registrationId === 'string' &&
		typeof row.contactId === 'string' &&
		typeof row.unitCode === 'string' &&
		(row.contactName === null || typeof row.contactName === 'string')
	);
}

/** What a generation actually amounted to, said as one of four things. */
export type GenerationOutcome =
	| { readonly kind: 'created'; readonly count: number }
	| { readonly kind: 'nothing_new' }
	| { readonly kind: 'type_retired' }
	| { readonly kind: 'refused'; readonly refusal: GenerationRefusal };

export function useGenerateMissionNotifications(): (
	missionId: string,
) => Promise<GenerationOutcome> {
	return useCallback(async (missionId: string): Promise<GenerationOutcome> => {
		const response = await sessionFetch(
			`${getServerUrl()}/commands/mission_notifications/generate`,
			{
				method: 'POST',
				credentials: 'include',
				headers: { accept: 'application/json', 'content-type': 'application/json' },
				// The column name, as everywhere else on the `/commands` surface.
				body: JSON.stringify({ mission_id: missionId }),
			},
		);

		const body = await readResponseBody(response);
		if (!response.ok) {
			const error = commandErrorFrom(response, body, 'Unable to work out who to notify.');
			const refusal = generationRefusalOf(error);
			if (refusal === null) {
				throw error;
			}
			return { kind: 'refused', refusal };
		}

		return generationOutcomeOf(body as unknown as GenerationResult);
	}, []);
}

/**
 * Which of the three successes a result is.
 *
 * Pure and exported for its test, because the mistake here is invisible from the
 * call site: a retired notification type and a regeneration that changed nothing
 * are the same empty `created`, and `notification_type_active` is the only thing
 * that tells them apart. Read as one answer, the operator goes looking at their
 * registrations for a problem that is in the notification type catalog.
 */
export function generationOutcomeOf(result: GenerationResult): GenerationOutcome {
	if (!result.notification_type_active) {
		return { kind: 'type_retired' };
	}
	return result.created.length > 0
		? { kind: 'created', count: result.created.length }
		: { kind: 'nothing_new' };
}
