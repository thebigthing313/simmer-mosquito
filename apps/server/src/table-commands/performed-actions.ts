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
	type CommandPayload,
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
	BiocontrolActionRow,
	OutreachActionRow,
	SourceReductionRow,
} from '../control-operations-commands/shared.js';
import type { IntentRequest, TableCommands } from './dispatch.js';
import { acknowledged, drawnGeometry } from './shared.js';

/** The three tables this module serves, with one set of readers between them. */
type ActionTable = 'source_reductions' | 'outreach_actions' | 'biocontrol_actions';

/**
 * The keys a performed-action write reads that are not its columns: the two
 * spellings of where it happened, and what it was recorded against.
 */
type ActionArgument = 'locationSource' | 'geometry' | 'context';

/** The body of a write to any of the three. */
type ActionPayload = CommandPayload<ActionTable, ActionArgument>;

/**
 * The surveillance record this action was made against.
 *
 * Passed through untyped for the reason `locationSource` is: which shapes a
 * context may take is the domain builder's rule, and re-stating it here would be
 * a second copy of it that could disagree. An absent one is `kind: 'none'`,
 * which is a real answer — plenty of work is not attached to anything.
 */
function actionContext(payload: ActionPayload): ControlActionContext {
	return (payload.context ?? { kind: 'none' }) as ControlActionContext;
}

/** What every action's ordinary create takes beyond its own measurements. */
function actionPlacement(payload: ActionPayload) {
	return {
		locationSource: payload.locationSource as ControlActionLocationSourceInput,
		addressId: readNullableText(payload.address_id),
		context: actionContext(payload),
		requestedControlActionId: readNullableText(payload.requested_control_action_id),
		metadata: payload.metadata ?? null,
	};
}

/**
 * The same, off a mission stop.
 *
 * `geometry` rather than `locationSource`, and spread only when present: the
 * stop's own ground is the default, and an explicit `undefined` would read as an
 * instruction to clear it.
 */
function missionPlacement(payload: ActionPayload) {
	const geometry = payload.geometry ?? drawnGeometry(payload.locationSource);
	return {
		...(geometry === undefined ? {} : { geometry }),
		addressId: readNullableText(payload.address_id),
		context: actionContext(payload),
		requestedControlActionId: readNullableText(payload.requested_control_action_id),
		metadata: payload.metadata ?? null,
		...readMissionExecutionOptions(payload),
	};
}

function missionStop({ payload, organization, id }: IntentRequest<ActionTable, ActionArgument>) {
	return {
		...organization,
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
function placementChanges(payload: ActionPayload) {
	return {
		...(payload.locationSource !== undefined
			? { locationSource: payload.locationSource as ControlActionLocationSourceInput }
			: {}),
		...(payload.address_id !== undefined
			? { addressId: readNullableText(payload.address_id) }
			: {}),
		...(payload.context !== undefined ? { context: actionContext(payload) } : {}),
		...(payload.requested_control_action_id !== undefined
			? { requestedControlActionId: readNullableText(payload.requested_control_action_id) }
			: {}),
	};
}

/** The two fields every action's field-details edit shares. */
function sharedFieldChanges(payload: ActionPayload) {
	return {
		...(payload.technician_profile_id !== undefined
			? { technicianProfileId: readNullableText(payload.technician_profile_id) }
			: {}),
		...(payload.metadata !== undefined ? { metadata: payload.metadata ?? null } : {}),
	};
}

export function sourceReductionTableCommands(
	db: CommandDb,
): TableCommands<'source_reductions', ActionCommand, SourceReductionRow, ActionArgument> {
	return {
		table: 'source_reductions',
		run: {
			db,
			write: writeSourceReductionCommand,
			notFound: 'source_reduction_not_found',
			key: 'sourceReduction',
		},
		intents: {
			'controlOperations.recordSourceReduction': ({ payload, organization, id }) =>
				recordSourceReductionCommand({
					...organization,
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

			'controlOperations.updateSourceReductionFieldDetails': ({ payload, organization, id }) =>
				updateSourceReductionFieldDetailsCommand({
					...organization,
					sourceReductionId: id,
					...sharedFieldChanges(payload),
					...(payload.source_reduction_date !== undefined
						? { sourceReductionDate: readText(payload.source_reduction_date) ?? '' }
						: {}),
					...(payload.source_reduction_method_id !== undefined
						? { sourceReductionMethodId: readText(payload.source_reduction_method_id) ?? '' }
						: {}),
					...(payload.sources_eliminated_amount !== undefined
						? {
								sourcesEliminatedAmount:
									readNumber(payload.sources_eliminated_amount) ?? Number.NaN,
							}
						: {}),
					...(payload.sources_eliminated_unit_id !== undefined
						? { sourcesEliminatedUnitId: readText(payload.sources_eliminated_unit_id) ?? '' }
						: {}),
				}),

			'controlOperations.updateSourceReductionLocationAndContext': ({
				payload,
				organization,
				id,
			}) =>
				updateSourceReductionLocationAndContextCommand({
					...organization,
					sourceReductionId: id,
					...placementChanges(payload),
				}),

			'controlOperations.deleteSourceReduction': ({ payload, organization, id }) =>
				deleteSourceReductionCommand({
					...organization,
					sourceReductionId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload,
						'acknowledgedSupportRecordDeletion',
					),
				}),
		},
	};
}

export function outreachActionTableCommands(
	db: CommandDb,
): TableCommands<'outreach_actions', ActionCommand, OutreachActionRow, ActionArgument> {
	return {
		table: 'outreach_actions',
		run: {
			db,
			write: writeOutreachActionCommand,
			notFound: 'outreach_action_not_found',
			key: 'outreachAction',
		},
		intents: {
			'controlOperations.recordOutreachAction': ({ payload, organization, id }) =>
				recordOutreachActionCommand({
					...organization,
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

			'controlOperations.updateOutreachActionFieldDetails': ({ payload, organization, id }) =>
				updateOutreachActionFieldDetailsCommand({
					...organization,
					outreachActionId: id,
					...sharedFieldChanges(payload),
					...(payload.outreach_date !== undefined
						? { outreachDate: readText(payload.outreach_date) ?? '' }
						: {}),
					...(payload.outreach_method_id !== undefined
						? { outreachMethodId: readText(payload.outreach_method_id) ?? '' }
						: {}),
					...(payload.reach !== undefined ? { reach: readNumber(payload.reach) ?? 0 } : {}),
					...(payload.reach_description !== undefined
						? { reachDescription: readNullableText(payload.reach_description) }
						: {}),
				}),

			'controlOperations.updateOutreachActionLocationAndContext': ({ payload, organization, id }) =>
				updateOutreachActionLocationAndContextCommand({
					...organization,
					outreachActionId: id,
					...placementChanges(payload),
				}),

			'controlOperations.deleteOutreachAction': ({ payload, organization, id }) =>
				deleteOutreachActionCommand({
					...organization,
					outreachActionId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload,
						'acknowledgedSupportRecordDeletion',
					),
				}),
		},
	};
}

export function biocontrolActionTableCommands(
	db: CommandDb,
): TableCommands<'biocontrol_actions', ActionCommand, BiocontrolActionRow, ActionArgument> {
	return {
		table: 'biocontrol_actions',
		run: {
			db,
			write: writeBiocontrolActionCommand,
			notFound: 'biocontrol_action_not_found',
			key: 'biocontrolAction',
		},
		intents: {
			'controlOperations.recordBiocontrolAction': ({ payload, organization, id }) =>
				recordBiocontrolActionCommand({
					...organization,
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

			'controlOperations.updateBiocontrolActionFieldDetails': ({ payload, organization, id }) =>
				updateBiocontrolActionFieldDetailsCommand({
					...organization,
					biocontrolActionId: id,
					...sharedFieldChanges(payload),
					...(payload.biocontrol_date !== undefined
						? { biocontrolDate: readText(payload.biocontrol_date) ?? '' }
						: {}),
					...(payload.biocontrol_method_id !== undefined
						? { biocontrolMethodId: readText(payload.biocontrol_method_id) ?? '' }
						: {}),
					...(payload.amount_released !== undefined
						? { amountReleased: readNumber(payload.amount_released) ?? Number.NaN }
						: {}),
					...(payload.release_unit_id !== undefined
						? { releaseUnitId: readText(payload.release_unit_id) ?? '' }
						: {}),
				}),

			'controlOperations.updateBiocontrolActionLocationAndContext': ({
				payload,
				organization,
				id,
			}) =>
				updateBiocontrolActionLocationAndContextCommand({
					...organization,
					biocontrolActionId: id,
					...placementChanges(payload),
				}),

			'controlOperations.deleteBiocontrolAction': ({ payload, organization, id }) =>
				deleteBiocontrolActionCommand({
					...organization,
					biocontrolActionId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload,
						'acknowledgedSupportRecordDeletion',
					),
				}),
		},
	};
}
