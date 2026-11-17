/**
 * Recording, correcting and removing a Treatment: one visit's insecticide work
 * and its lines, one Chemical Application per Insecticide (ADR 0020). Returns
 * `record`, `update`, `remove` and `canWrite`.
 *
 * A create is one `recordTreatment`, or `recordTreatmentForMissionItem` off a
 * stop, carrying every line and batch link, through `commandTransaction` with
 * optimistic rows in `treatments`, `applications` and `application_batches`.
 * An edit that moves the lines is one PATCH naming the header intents it
 * touched beside `reviseTreatmentLines` with the full set; an edit that leaves
 * the lines alone is a header-only PATCH on `treatments`. A delete takes its
 * lines with it and asks only about batch links and support records.
 */

import type { SingleRowCommandType } from '@simmer-mosquito/domain';
import {
	type ApplicationBatch as ApplicationBatchRow,
	type Application as ApplicationRow,
	commandBodyFromRow,
	settleWrite,
	type Treatment as TreatmentRow,
} from '@simmer-mosquito/sync';
import type { StopAcknowledgements } from '../../lib/acknowledgements';
import { application_batches } from '../../lib/collections/application_batches';
import { applications } from '../../lib/collections/applications';
import { mutateCollection } from '../../lib/collections/mutate';
import { commandTransaction } from '../../lib/collections/transact';
import { treatments } from '../../lib/collections/treatments';
import type { TreatmentDetail } from '../queries/control-action-view';
import type { TreatmentBatchLink } from '../queries/use-treatment-batch-links';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type ActionLocation,
	actionEditIntents,
	contextFor,
	metadataChanged,
} from './performed-action-writes';
import { canAttributeWrite, newRecordId, optimisticStamp } from './shared';

/** The visit's own fields, in the vocabulary the page speaks. */
export interface TreatmentValues {
	/** `YYYY-MM-DD`: the operational date, not a timestamp. */
	readonly actionDate: string;
	/** `null` when the crew recorded no method. */
	readonly methodId: string | null;
	/** `null` when the crew recorded no lead applicator. */
	readonly applicatorProfileId: string | null;
	readonly vehicleId: string | null;
	readonly equipmentId: string | null;
	/** Reference only; the Treatment's own geometry is its location. */
	readonly addressId: string | null;
	/** The Habitat that was treated, if any. */
	readonly habitatId: string | null;
	readonly metadata: unknown;
}

/** The Formulation a Treatment was mixed from. All three travel together. */
export interface TreatmentMix {
	readonly formulationId: string;
	readonly mixAmount: number;
	/** The Formulation's `batch_unit_id`, which the server checks. */
	readonly mixUnitId: string;
}

/** One line as the form saves it. */
export interface TreatmentLineInput {
	/** The Chemical Application's id: stored, or minted by the form for a new line. */
	readonly id: string;
	readonly insecticideId: string;
	readonly amountApplied: number;
	readonly unitId: string;
	readonly insecticideBatchIds: readonly string[];
}

export interface RecordTreatmentInput {
	/** Minted by the caller, so support rows can name it once it lands. */
	readonly treatmentId: string;
	readonly values: TreatmentValues;
	/** `null` for product by product. */
	readonly mix: TreatmentMix | null;
	/** At least one, one per Insecticide. */
	readonly lines: readonly TreatmentLineInput[];
	readonly location: ActionLocation;
	/** Set when the Treatment was recorded against a mission stop. */
	readonly missionItemId: string | null;
	readonly acknowledgements?: StopAcknowledgements;
}

export interface UpdateTreatmentInput {
	readonly values: TreatmentValues;
	readonly mix: TreatmentMix | null;
	/** The full line set the Treatment should hold after the save. */
	readonly lines: readonly TreatmentLineInput[];
	/** The batch links stored now, so a kept lot keeps its link id. */
	readonly savedLinks: readonly TreatmentBatchLink[];
	/** Only when the user moved the shape this session. */
	readonly location?: ActionLocation;
}

export interface TreatmentMutations {
	readonly record: (input: RecordTreatmentInput) => Promise<void>;
	readonly update: (current: TreatmentDetail, input: UpdateTreatmentInput) => Promise<void>;
	/**
	 * Delete a Treatment and its lines. Withheld flags go on the wire as `false`,
	 * which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		treatmentId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

/** A line and its links, as the command spells the rows they become. */
interface LineWrite {
	readonly line: TreatmentLineInput;
	readonly links: readonly { readonly id: string; readonly insecticideBatchId: string }[];
}

/** The line set in the row shape both the create and the revise carry. */
function applicationsBody(writes: readonly LineWrite[]) {
	return writes.map(({ line, links }) => ({
		id: line.id,
		insecticide_id: line.insecticideId,
		amount_applied: line.amountApplied,
		application_unit_id: line.unitId,
		application_batches: links.map((link) => ({
			id: link.id,
			insecticide_batch_id: link.insecticideBatchId,
		})),
	}));
}

/**
 * Each line's links: a lot the line already drew from keeps its stored link id,
 * because the server refuses a stored id sent with a different batch, and a new
 * lot gets a new id.
 */
function lineWrites(
	lines: readonly TreatmentLineInput[],
	savedLinks: readonly TreatmentBatchLink[],
): readonly LineWrite[] {
	return lines.map((line) => ({
		line,
		links: [...new Set(line.insecticideBatchIds)].map((insecticideBatchId) => {
			const saved = savedLinks.find(
				(link) => link.applicationId === line.id && link.insecticideBatchId === insecticideBatchId,
			);
			return { id: saved?.id ?? newRecordId(), insecticideBatchId };
		}),
	}));
}

function mixColumns(mix: TreatmentMix | null) {
	return {
		formulation_id: mix?.formulationId ?? null,
		mix_amount: mix?.mixAmount ?? null,
		mix_unit_id: mix?.mixUnitId ?? null,
	};
}

/** Whether the saved line set differs from the one the form holds, lots included. */
function linesChanged(
	current: TreatmentDetail,
	lines: readonly TreatmentLineInput[],
	savedLinks: readonly TreatmentBatchLink[],
): boolean {
	if (current.lines.length !== lines.length) {
		return true;
	}
	return lines.some((line) => {
		const stored = current.lines.find((row) => row.id === line.id);
		if (stored === undefined || lineMoved(stored, line)) {
			return true;
		}
		const savedBatches = new Set(
			savedLinks
				.filter((link) => link.applicationId === line.id)
				.map((link) => link.insecticideBatchId),
		);
		const formBatches = new Set(line.insecticideBatchIds);
		return (
			savedBatches.size !== formBatches.size ||
			[...formBatches].some((batchId) => !savedBatches.has(batchId))
		);
	});
}

/** What an edit moves on the Treatment row itself, and the instructions beside it. */
interface HeaderEdit {
	readonly fieldsMoved: boolean;
	readonly placementMoved: boolean;
	readonly changes: Record<string, unknown>;
	readonly instructions: { readonly locationSource?: unknown; readonly context?: unknown };
}

function mixChanged(current: TreatmentDetail, mix: TreatmentMix | null): boolean {
	return (
		current.formulationId !== (mix?.formulationId ?? null) ||
		current.mixAmount !== (mix?.mixAmount ?? null) ||
		current.mixUnitId !== (mix?.mixUnitId ?? null)
	);
}

function fieldDetailsChanged(current: TreatmentDetail, values: TreatmentValues): boolean {
	return (
		current.actionDate !== values.actionDate ||
		current.methodId !== values.methodId ||
		current.applicatorProfileId !== values.applicatorProfileId ||
		current.vehicleId !== values.vehicleId ||
		current.equipmentId !== values.equipmentId ||
		metadataChanged(current.metadata, values.metadata)
	);
}

/** The field-details columns, sent whole once any of them moved. */
function fieldDetailColumns({ values, mix }: UpdateTreatmentInput, mixMoved: boolean) {
	return {
		application_date: values.actionDate,
		application_method_id: values.methodId,
		applicator_profile_id: values.applicatorProfileId,
		vehicle_id: values.vehicleId,
		equipment_id: values.equipmentId,
		metadata: values.metadata,
		// The set travels whole: the builder refuses one key of the three.
		...(mixMoved ? mixColumns(mix) : {}),
	};
}

/** The placement columns that moved, and the centroid reseeded from a redrawn shape. */
function placementColumns(current: TreatmentDetail, { values, location }: UpdateTreatmentInput) {
	return {
		...(current.addressId === values.addressId ? {} : { address_id: values.addressId }),
		...(current.habitatId === values.habitatId ? {} : { habitat_id: values.habitatId }),
		// Reseeded so the marker moves before the server answers. The server
		// recomputes all three from the geometry it stores.
		...(location === undefined
			? {}
			: { lat: location.lat, lng: location.lng, geom_type: location.geomType }),
	};
}

/** Where the shape comes from, and the context when the habitat is what moved. */
function placementInstructions(
	current: TreatmentDetail,
	{ values, location }: UpdateTreatmentInput,
): HeaderEdit['instructions'] {
	return {
		...(location?.locationSource === undefined ? {} : { locationSource: location.locationSource }),
		// Carrying the Inspection through; see `contextFor`.
		...(current.habitatId === values.habitatId
			? {}
			: { context: contextFor(values.habitatId, current.inspectionId) }),
	};
}

/**
 * The header half of an edit: which of the two header intents it names, the
 * changed columns, and the location and context instructions.
 */
function headerEdit(current: TreatmentDetail, input: UpdateTreatmentInput): HeaderEdit {
	const mixMoved = mixChanged(current, input.mix);
	const fieldsMoved = mixMoved || fieldDetailsChanged(current, input.values);
	const placement = placementColumns(current, input);
	const instructions = placementInstructions(current, input);
	return {
		fieldsMoved,
		placementMoved:
			'address_id' in placement || 'habitat_id' in placement || 'locationSource' in instructions,
		changes: { ...(fieldsMoved ? fieldDetailColumns(input, mixMoved) : {}), ...placement },
		instructions,
	};
}

/** The stamp every optimistic row a revise writes carries. */
interface RevisionStamp {
	readonly organization_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
	readonly updated_by_profile_id: string;
}

/**
 * The revise's optimistic rows: a stored line the set left out goes, a new line
 * and a new link arrive, a line whose product or amount moved is updated, and a
 * stored link the set no longer holds goes. Runs inside the transaction.
 */
function applyRevision({
	current,
	writes,
	savedLinks,
	stamp,
	actorProfileId,
}: {
	readonly current: TreatmentDetail;
	readonly writes: readonly LineWrite[];
	readonly savedLinks: readonly TreatmentBatchLink[];
	readonly stamp: RevisionStamp;
	readonly actorProfileId: string;
}): void {
	const created = { ...stamp, created_by_profile_id: actorProfileId };
	const audit = {
		updated_at: stamp.updated_at,
		updated_by_profile_id: stamp.updated_by_profile_id,
	};
	const keptIds = new Set(writes.map((write) => write.line.id));
	for (const stored of current.lines.filter((row) => !keptIds.has(row.id))) {
		applications().delete(stored.id);
	}
	for (const { line } of writes) {
		const stored = current.lines.find((row) => row.id === line.id);
		if (stored === undefined) {
			applications().insert({
				...created,
				id: line.id,
				treatment_id: current.id,
				insecticide_id: line.insecticideId,
				amount_applied: line.amountApplied,
				application_unit_id: line.unitId,
			} satisfies ApplicationRow);
		} else if (lineMoved(stored, line)) {
			applications().update(line.id, (draft) => {
				Object.assign(draft, audit, {
					insecticide_id: line.insecticideId,
					amount_applied: line.amountApplied,
					application_unit_id: line.unitId,
				});
			});
		}
	}
	const savedIds = new Set(savedLinks.map((link) => link.id));
	const links = writes.flatMap(({ line, links: lineLinks }) =>
		lineLinks.map((link) => ({ link, applicationId: line.id })),
	);
	for (const { link, applicationId } of links.filter(({ link }) => !savedIds.has(link.id))) {
		application_batches().insert({
			...created,
			id: link.id,
			application_id: applicationId,
			insecticide_batch_id: link.insecticideBatchId,
		} satisfies ApplicationBatchRow);
	}
	// A link the set no longer holds goes, with a removed line's links.
	const keptLinkIds = new Set(links.map(({ link }) => link.id));
	for (const saved of savedLinks.filter((link) => !keptLinkIds.has(link.id))) {
		application_batches().delete(saved.id);
	}
}

/** Whether a kept line's product, amount or unit moved. */
function lineMoved(stored: TreatmentDetail['lines'][number], line: TreatmentLineInput): boolean {
	return (
		stored.insecticideId !== line.insecticideId ||
		stored.amount !== line.amountApplied ||
		stored.unitId !== line.unitId
	);
}

export function useTreatmentMutations(): TreatmentMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = async ({
		treatmentId,
		values,
		mix,
		lines,
		location,
		missionItemId,
		acknowledgements,
	}: RecordTreatmentInput) => {
		if (organizationId === null || actorProfileId === null) {
			throw new Error('Your profile is still loading.');
		}

		const now = optimisticStamp();
		const audit = {
			created_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			created_at: now,
			updated_at: now,
		};
		const row = {
			id: treatmentId,
			organization_id: organizationId,
			application_date: values.actionDate,
			applicator_profile_id: values.applicatorProfileId,
			application_method_id: values.methodId,
			vehicle_id: values.vehicleId,
			equipment_id: values.equipmentId,
			address_id: values.addressId,
			habitat_id: values.habitatId,
			// A create never promotes an existing Inspection, Collection or requested
			// action; all three are attached by the flows that own them.
			inspection_id: null,
			collection_id: null,
			requested_control_action_id: null,
			mission_item_id: missionItemId,
			...mixColumns(mix),
			lat: location.lat,
			lng: location.lng,
			geom_type: location.geomType,
			metadata: values.metadata,
			...audit,
			// `satisfies` rather than `as`: a wrong column name is a compile error
			// rather than a field the server silently ignores.
		} satisfies TreatmentRow;

		const writes = lineWrites(lines, []);

		await settleWrite(
			commandTransaction({
				// The stop is what makes it the other command; only that one also
				// closes the mission item, once per Treatment.
				intent:
					missionItemId === null
						? 'controlOperations.recordTreatment'
						: 'missionDispatch.recordTreatmentForMissionItem',
				request: {
					table: 'treatments',
					method: 'POST',
					body: {
						...commandBodyFromRow(row, {
							...(location.locationSource === undefined
								? {}
								: { locationSource: location.locationSource }),
							context: contextFor(values.habitatId, null),
							...(acknowledgements === undefined ? {} : { acknowledgements }),
						}),
						applications: applicationsBody(writes),
					},
				},
				apply: () => {
					treatments().insert(row);
					for (const { line, links } of writes) {
						applications().insert({
							id: line.id,
							organization_id: organizationId,
							treatment_id: treatmentId,
							insecticide_id: line.insecticideId,
							amount_applied: line.amountApplied,
							application_unit_id: line.unitId,
							...audit,
						} satisfies ApplicationRow);
						for (const link of links) {
							application_batches().insert({
								id: link.id,
								organization_id: organizationId,
								application_id: line.id,
								insecticide_batch_id: link.insecticideBatchId,
								...audit,
							} satisfies ApplicationBatchRow);
						}
					}
				},
			}),
		);
	};

	const update = async (current: TreatmentDetail, input: UpdateTreatmentInput) => {
		if (organizationId === null || actorProfileId === null) {
			throw new Error('Your profile is still loading.');
		}
		const header = headerEdit(current, input);
		const linesMoved = linesChanged(current, input.lines, input.savedLinks);
		if (!header.fieldsMoved && !header.placementMoved && !linesMoved) {
			return;
		}

		const headerIntents: readonly SingleRowCommandType[] = actionEditIntents({
			fieldsMoved: header.fieldsMoved,
			fieldsIntent: 'controlOperations.updateTreatmentFieldDetails',
			placementMoved: header.placementMoved,
			placementIntent: 'controlOperations.updateTreatmentLocationAndContext',
		});
		const now = optimisticStamp();
		const audit = { updated_by_profile_id: actorProfileId, updated_at: now };

		if (!linesMoved) {
			await settleWrite(
				mutateCollection(treatments(), {
					operation: 'update',
					intent: headerIntents,
					key: current.id,
					changes: { ...header.changes, ...audit },
					...header.instructions,
				}),
			);
			return;
		}

		const writes = lineWrites(input.lines, input.savedLinks);
		await settleWrite(
			commandTransaction({
				intent: 'controlOperations.reviseTreatmentLines',
				alongside: headerIntents,
				request: {
					table: 'treatments',
					method: 'PATCH',
					key: current.id,
					body: {
						...commandBodyFromRow(header.changes, header.instructions),
						applications: applicationsBody(writes),
					},
				},
				apply: () => {
					if (header.fieldsMoved || header.placementMoved) {
						treatments().update(current.id, (draft) => {
							Object.assign(draft, header.changes, audit);
						});
					}
					applyRevision({
						current,
						writes,
						savedLinks: input.savedLinks,
						stamp: { organization_id: organizationId, created_at: now, ...audit },
						actorProfileId,
					});
				},
			}),
		);
	};

	const remove = async (
		treatmentId: string,
		acknowledgements: Readonly<Record<string, boolean>> = {},
	) => {
		await settleWrite(
			mutateCollection(treatments(), {
				operation: 'delete',
				intent: 'controlOperations.deleteTreatment',
				key: treatmentId,
				// A delete carries no row and no changed fields, so an acknowledgement
				// is the only thing it can say beyond the command's name.
				acknowledgements,
			}),
		);
	};

	return {
		record,
		update,
		remove,
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	};
}
