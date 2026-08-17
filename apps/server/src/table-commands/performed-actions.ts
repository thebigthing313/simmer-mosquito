/**
 * The three performed-action tables, as commands.
 *
 * `source_reductions`, `outreach_actions` and `biocontrol_actions` — the work a
 * technician did, as opposed to the work somebody asked for
 * (`requested_control_actions`) or the chemical it was done with
 * (`applications`).
 *
 * Fifteen commands. The old surface chose between the two creates by reading
 * `missionItemId` off the body: present meant the mission-stop command, which
 * writes the record *and* closes the stop in one transaction, absent meant the
 * ordinary one. That is the same reading `collections` made and the same one it
 * is not making any more.
 *
 * ## `context` stays camelCase, and this is the interesting case
 *
 * A performed action carries the surveillance record it was made against —
 * `{ kind: 'larval', habitatId, inspectionId }`, `{ kind: 'adult', collectionId }`,
 * or `{ kind: 'none' }`. The rule elsewhere in this folder is that a key is
 * snake_case exactly when a column answers to it, and no column answers to this
 * one: a larval context lands in two columns (`habitat_id`, `inspection_id`),
 * and an adult context lands in *none* of them — it resolves geometry and is
 * otherwise not stored on these tables at all.
 *
 * The old reader also accepted the columns directly and rebuilt the context from
 * whichever ids happened to be present, so sending a `habitat_id` produced a
 * larval context and sending nothing produced `kind: 'none'`. That is not kept.
 * A caller states the context; the discriminant is the domain's to validate, not
 * something to infer from which foreign keys arrived.
 *
 * ## Field names
 *
 * Postgres column names for everything a column holds: `source_reduction_date`,
 * `technician_profile_id`, `sources_eliminated_amount`, `reach`,
 * `amount_released`, `release_unit_id`, `requested_control_action_id`. The
 * exceptions all name instructions rather than columns — `context`,
 * `locationSource`, `geometry`, `missionItemId`, and the mission execution
 * flags.
 *
 * `geometry` is the one that only appears on the mission-stop half: a stop
 * already has ground of its own, so the record takes raw GeoJSON where the
 * ordinary create takes a `locationSource` naming a row to copy geometry from.
 */

import type {
	ControlActionContext,
	ControlActionLocationSourceInput,
} from '@simmer-mosquito/domain';
import {
	deleteBiocontrolActionCommand,
	deleteOutreachActionCommand,
	deleteSourceReductionCommand,
	recordBiocontrolActionCommand,
	recordBiocontrolActionForMissionItemCommand,
	recordOutreachActionCommand,
	recordOutreachActionForMissionItemCommand,
	recordSourceReductionCommand,
	recordSourceReductionForMissionItemCommand,
	updateBiocontrolActionFieldDetailsCommand,
	updateBiocontrolActionLocationAndContextCommand,
	updateOutreachActionFieldDetailsCommand,
	updateOutreachActionLocationAndContextCommand,
	updateSourceReductionFieldDetailsCommand,
	updateSourceReductionLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import {
	readMissionExecutionOptions,
	readNullableText,
	readNumber,
	readText,
} from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import {
	type ActionCommand,
	writeBiocontrolActionCommand,
	writeOutreachActionCommand,
	writeSourceReductionCommand,
} from '../control-operations-commands/performed-actions.js';
import type {
	SafeBiocontrolAction,
	SafeOutreachAction,
	SafeSourceReduction,
} from '../control-operations-commands/shared.js';
import type { IntentRequest, TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * The surveillance record this action was made against.
 *
 * Passed through untyped for the reason `locationSource` is: which shapes a
 * context may take is the domain builder's rule, and re-stating it here would be
 * a second copy of it that could disagree. An absent one is `kind: 'none'`,
 * which is a real answer — plenty of work is not attached to anything.
 */
function actionContext(payload: Record<string, unknown>): ControlActionContext {
	return (payload.context ?? { kind: 'none' }) as ControlActionContext;
}

/** What every action's ordinary create takes beyond its own measurements. */
function actionPlacement(payload: Record<string, unknown>) {
	return {
		locationSource: payload.locationSource as ControlActionLocationSourceInput,
		addressId: readNullableText(payload.address_id),
		context: actionContext(payload),
		requestedControlActionId: readNullableText(payload.requested_control_action_id),
		metadata: payload.metadata ?? null,
	};
}

/**
 * A drawn shape, taken out of the location instruction that carried it.
 *
 * A mission execution takes a bare `geometry` override rather than a
 * `locationSource`, because the stop's own ground is the default and the only
 * thing that may replace it is a shape the crew drew. Every other kind — an
 * address, a habitat — is a source this command has no reader for, and would
 * fall through to the stop's geometry rather than being honoured.
 *
 * Clients still state their location one way, as a `locationSource`, so that a
 * form does not have to know which of the two commands its save will become.
 * Unwrapping it is this reader's job: the distinction is the domain's, and the
 * transport should not make every caller mirror it.
 */
function drawnGeometry(payload: Record<string, unknown>): unknown {
	const source = payload.locationSource;
	if (typeof source !== 'object' || source === null) {
		return undefined;
	}
	const { kind, geometry } = source as { readonly kind?: unknown; readonly geometry?: unknown };
	return kind === 'geometry' ? geometry : undefined;
}

/**
 * The same, off a mission stop.
 *
 * `geometry` rather than `locationSource`, and spread only when present: the
 * stop's own ground is the default, and an explicit `undefined` would read as an
 * instruction to clear it.
 */
function missionPlacement(payload: Record<string, unknown>) {
	const geometry = payload.geometry ?? drawnGeometry(payload);
	return {
		...(geometry === undefined ? {} : { geometry }),
		addressId: readNullableText(payload.address_id),
		context: actionContext(payload),
		requestedControlActionId: readNullableText(payload.requested_control_action_id),
		metadata: payload.metadata ?? null,
		...readMissionExecutionOptions(payload),
	};
}

function missionStop({ payload, agency, id }: IntentRequest) {
	return {
		...agency,
		missionItemId: readText(payload.mission_item_id) ?? '',
		...missionPlacement(payload),
		id,
	};
}

/**
 * The location and context fields an edit named.
 *
 * Presence rather than value, and for the reason presence can answer here: each
 * is independently optional, and a `null` address means detach where an absent
 * one means leave it. `context` is read whole — half a context is not a state
 * the record can hold.
 */
function placementChanges(payload: Record<string, unknown>) {
	return {
		...('locationSource' in payload
			? { locationSource: payload.locationSource as ControlActionLocationSourceInput }
			: {}),
		...('address_id' in payload ? { addressId: readNullableText(payload.address_id) } : {}),
		...('context' in payload ? { context: actionContext(payload) } : {}),
		...('requested_control_action_id' in payload
			? { requestedControlActionId: readNullableText(payload.requested_control_action_id) }
			: {}),
	};
}

/** The two fields every action's field-details edit shares. */
function sharedFieldChanges(payload: Record<string, unknown>) {
	return {
		...('technician_profile_id' in payload
			? { technicianProfileId: readNullableText(payload.technician_profile_id) }
			: {}),
		...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
	};
}

export function sourceReductionTableCommands(
	db: CommandDb,
): TableCommands<ActionCommand, SafeSourceReduction> {
	return {
		table: 'source_reductions',
		run: {
			db,
			write: writeSourceReductionCommand,
			notFound: 'source_reduction_not_found',
			key: 'sourceReduction',
		},
		intents: {
			'controlOperations.recordSourceReduction': ({ payload, agency, id }) =>
				recordSourceReductionCommand({
					...agency,
					sourceReductionId: id,
					sourceReductionMethodId: readText(payload.source_reduction_method_id) ?? '',
					technicianProfileId: readNullableText(payload.technician_profile_id),
					sourceReductionDate: readText(payload.source_reduction_date) ?? '',
					sourcesEliminatedAmount: readNumber(payload.sources_eliminated_amount) ?? Number.NaN,
					sourcesEliminatedUnitId: readText(payload.sources_eliminated_unit_id) ?? '',
					...actionPlacement(payload),
				}),

			'missionDispatch.recordSourceReductionForMissionItem': (request) => {
				const { id, ...stop } = missionStop(request);
				return recordSourceReductionForMissionItemCommand({
					...stop,
					sourceReductionId: id,
					sourceReductionMethodId: readText(request.payload.source_reduction_method_id) ?? '',
					technicianProfileId: readNullableText(request.payload.technician_profile_id),
					sourceReductionDate: readText(request.payload.source_reduction_date) ?? '',
					sourcesEliminatedAmount:
						readNumber(request.payload.sources_eliminated_amount) ?? Number.NaN,
					sourcesEliminatedUnitId: readText(request.payload.sources_eliminated_unit_id) ?? '',
				});
			},

			'controlOperations.updateSourceReductionFieldDetails': ({ payload, agency, id }) =>
				updateSourceReductionFieldDetailsCommand({
					...agency,
					sourceReductionId: id,
					...sharedFieldChanges(payload),
					...('source_reduction_date' in payload
						? { sourceReductionDate: readText(payload.source_reduction_date) ?? '' }
						: {}),
					...('source_reduction_method_id' in payload
						? { sourceReductionMethodId: readText(payload.source_reduction_method_id) ?? '' }
						: {}),
					...('sources_eliminated_amount' in payload
						? {
								sourcesEliminatedAmount:
									readNumber(payload.sources_eliminated_amount) ?? Number.NaN,
							}
						: {}),
					...('sources_eliminated_unit_id' in payload
						? { sourcesEliminatedUnitId: readText(payload.sources_eliminated_unit_id) ?? '' }
						: {}),
				}),

			'controlOperations.updateSourceReductionLocationAndContext': ({ payload, agency, id }) =>
				updateSourceReductionLocationAndContextCommand({
					...agency,
					sourceReductionId: id,
					...placementChanges(payload),
				}),

			'controlOperations.deleteSourceReduction': ({ payload, agency, id }) =>
				deleteSourceReductionCommand({
					...agency,
					sourceReductionId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload.acknowledgedSupportRecordDeletion,
					),
				}),
		},
	};
}

export function outreachActionTableCommands(
	db: CommandDb,
): TableCommands<ActionCommand, SafeOutreachAction> {
	return {
		table: 'outreach_actions',
		run: {
			db,
			write: writeOutreachActionCommand,
			notFound: 'outreach_action_not_found',
			key: 'outreachAction',
		},
		intents: {
			'controlOperations.recordOutreachAction': ({ payload, agency, id }) =>
				recordOutreachActionCommand({
					...agency,
					outreachActionId: id,
					outreachMethodId: readText(payload.outreach_method_id) ?? '',
					technicianProfileId: readNullableText(payload.technician_profile_id),
					outreachDate: readText(payload.outreach_date) ?? '',
					// Zero rather than NaN: an outreach action that reached nobody is a
					// record worth keeping, so an absent count is not a refusal here.
					reach: readNumber(payload.reach) ?? 0,
					reachDescription: readNullableText(payload.reach_description),
					...actionPlacement(payload),
				}),

			'missionDispatch.recordOutreachActionForMissionItem': (request) => {
				const { id, ...stop } = missionStop(request);
				return recordOutreachActionForMissionItemCommand({
					...stop,
					outreachActionId: id,
					outreachMethodId: readText(request.payload.outreach_method_id) ?? '',
					technicianProfileId: readNullableText(request.payload.technician_profile_id),
					outreachDate: readText(request.payload.outreach_date) ?? '',
					reach: readNumber(request.payload.reach) ?? 0,
					reachDescription: readNullableText(request.payload.reach_description),
				});
			},

			'controlOperations.updateOutreachActionFieldDetails': ({ payload, agency, id }) =>
				updateOutreachActionFieldDetailsCommand({
					...agency,
					outreachActionId: id,
					...sharedFieldChanges(payload),
					...('outreach_date' in payload
						? { outreachDate: readText(payload.outreach_date) ?? '' }
						: {}),
					...('outreach_method_id' in payload
						? { outreachMethodId: readText(payload.outreach_method_id) ?? '' }
						: {}),
					...('reach' in payload ? { reach: readNumber(payload.reach) ?? 0 } : {}),
					...('reach_description' in payload
						? { reachDescription: readNullableText(payload.reach_description) }
						: {}),
				}),

			'controlOperations.updateOutreachActionLocationAndContext': ({ payload, agency, id }) =>
				updateOutreachActionLocationAndContextCommand({
					...agency,
					outreachActionId: id,
					...placementChanges(payload),
				}),

			'controlOperations.deleteOutreachAction': ({ payload, agency, id }) =>
				deleteOutreachActionCommand({
					...agency,
					outreachActionId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload.acknowledgedSupportRecordDeletion,
					),
				}),
		},
	};
}

export function biocontrolActionTableCommands(
	db: CommandDb,
): TableCommands<ActionCommand, SafeBiocontrolAction> {
	return {
		table: 'biocontrol_actions',
		run: {
			db,
			write: writeBiocontrolActionCommand,
			notFound: 'biocontrol_action_not_found',
			key: 'biocontrolAction',
		},
		intents: {
			'controlOperations.recordBiocontrolAction': ({ payload, agency, id }) =>
				recordBiocontrolActionCommand({
					...agency,
					biocontrolActionId: id,
					biocontrolMethodId: readText(payload.biocontrol_method_id) ?? '',
					technicianProfileId: readNullableText(payload.technician_profile_id),
					biocontrolDate: readText(payload.biocontrol_date) ?? '',
					amountReleased: readNumber(payload.amount_released) ?? Number.NaN,
					releaseUnitId: readText(payload.release_unit_id) ?? '',
					...actionPlacement(payload),
				}),

			'missionDispatch.recordBiocontrolActionForMissionItem': (request) => {
				const { id, ...stop } = missionStop(request);
				return recordBiocontrolActionForMissionItemCommand({
					...stop,
					biocontrolActionId: id,
					biocontrolMethodId: readText(request.payload.biocontrol_method_id) ?? '',
					technicianProfileId: readNullableText(request.payload.technician_profile_id),
					biocontrolDate: readText(request.payload.biocontrol_date) ?? '',
					amountReleased: readNumber(request.payload.amount_released) ?? Number.NaN,
					releaseUnitId: readText(request.payload.release_unit_id) ?? '',
				});
			},

			'controlOperations.updateBiocontrolActionFieldDetails': ({ payload, agency, id }) =>
				updateBiocontrolActionFieldDetailsCommand({
					...agency,
					biocontrolActionId: id,
					...sharedFieldChanges(payload),
					...('biocontrol_date' in payload
						? { biocontrolDate: readText(payload.biocontrol_date) ?? '' }
						: {}),
					...('biocontrol_method_id' in payload
						? { biocontrolMethodId: readText(payload.biocontrol_method_id) ?? '' }
						: {}),
					...('amount_released' in payload
						? { amountReleased: readNumber(payload.amount_released) ?? Number.NaN }
						: {}),
					...('release_unit_id' in payload
						? { releaseUnitId: readText(payload.release_unit_id) ?? '' }
						: {}),
				}),

			'controlOperations.updateBiocontrolActionLocationAndContext': ({ payload, agency, id }) =>
				updateBiocontrolActionLocationAndContextCommand({
					...agency,
					biocontrolActionId: id,
					...placementChanges(payload),
				}),

			'controlOperations.deleteBiocontrolAction': ({ payload, agency, id }) =>
				deleteBiocontrolActionCommand({
					...agency,
					biocontrolActionId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload.acknowledgedSupportRecordDeletion,
					),
				}),
		},
	};
}
