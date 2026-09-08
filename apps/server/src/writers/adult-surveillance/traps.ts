import {
	applyRecordDeletion,
	assertWriteReferences,
	checkedValues,
	sql,
} from '@simmer-mosquito/db';
import type { AdultSurveillanceCommand } from '@simmer-mosquito/domain';
import { CommandError } from '../../command-endpoint.js';
import {
	assertCitedHistoryAcknowledged,
	assertTrapCodeAcknowledged,
} from '../../record-history.js';
import { returnColumns } from '../../return-columns.js';
import {
	type AdultSurveillanceTransaction,
	resolveLocationGeom,
	surveillanceCatalogReferences,
	type TrapRow,
	type TrapUpdateColumns,
	updateRow,
} from './shared.js';

// ---------------------------------------------------------------------------
// Traps
// ---------------------------------------------------------------------------

/** Exported for `table-commands/traps.ts` — see `writeHabitatCommand`. */
export async function writeTrapCommand(
	trx: AdultSurveillanceTransaction,
	command: AdultSurveillanceCommand,
): Promise<TrapRow | null> {
	switch (command.type) {
		case 'adultSurveillance.createTrap': {
			await assertTrapCodeAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				trapCode: command.payload.trapCode,
				excludeTrapId: command.payload.trapId,
				acknowledged: command.payload.acknowledgedDuplicateTrapCode,
			});
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: surveillanceCatalogReferences(command.payload),
			});
			const row = await trx
				.insertInto('traps')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.trapId,
						organization_id: command.payload.organizationId,
						geom: await resolveLocationGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						collection_method_id: command.payload.collectionMethodId,
						address_id: command.payload.addressId,
						collection_lure_id: command.payload.collectionLureId,
						trap_name: command.payload.trapName,
						trap_code: command.payload.trapCode,
						description: command.payload.description,
						is_active: true,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(returnColumns.traps)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'adultSurveillance.updateTrapDetails':
			await assertTrapDisplayRemains(trx, {
				trapId: command.payload.trapId,
				organizationId: command.payload.organizationId,
				changes: command.payload.changes,
			});
			// A collection stores `trap_id` and nothing about what the trap was
			// called, so renaming or recoding one relabels every collection ever
			// taken from it. The description is not what a collection is read back
			// under, so editing it alone asks nothing.
			await assertCitedHistoryAcknowledged(trx, {
				recordType: 'trap',
				recordId: command.payload.trapId,
				organizationId: command.payload.organizationId,
				subject: 'trap',
				acknowledgement: 'acknowledgedHistoricalLabelChange',
				acknowledged: command.payload.acknowledgedHistoricalLabelChange,
				relabels: 'trapName' in command.payload.changes || 'trapCode' in command.payload.changes,
			});
			return updateTrap(trx, command.payload.trapId, command.payload.organizationId, {
				...('trapName' in command.payload.changes
					? { trap_name: command.payload.changes.trapName ?? null }
					: {}),
				...('trapCode' in command.payload.changes
					? { trap_code: command.payload.changes.trapCode ?? null }
					: {}),
				...('description' in command.payload.changes
					? { description: command.payload.changes.description ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.updateTrapConfiguration':
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'update', table: 'traps', recordId: command.payload.trapId },
				references: surveillanceCatalogReferences(command.payload.changes),
			});
			return updateTrap(trx, command.payload.trapId, command.payload.organizationId, {
				...(command.payload.changes.locationSource !== undefined
					? {
							geom: await resolveLocationGeom(
								trx,
								command.payload.organizationId,
								command.payload.changes.locationSource,
							),
						}
					: {}),
				...('collectionMethodId' in command.payload.changes
					? { collection_method_id: command.payload.changes.collectionMethodId }
					: {}),
				...('addressId' in command.payload.changes
					? { address_id: command.payload.changes.addressId ?? null }
					: {}),
				...('collectionLureId' in command.payload.changes
					? { collection_lure_id: command.payload.changes.collectionLureId ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.retireTrap':
			return updateTrap(trx, command.payload.trapId, command.payload.organizationId, {
				is_active: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.reactivateTrap': {
			// A code freed by retiring a trap may have been taken since, so bringing
			// the trap back is the second door onto the same collision.
			const reactivating = await trx
				.selectFrom('traps')
				.select(['trap_code'])
				.where('id', '=', command.payload.trapId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.executeTakeFirst();
			await assertTrapCodeAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				trapCode: reactivating?.trap_code ?? null,
				excludeTrapId: command.payload.trapId,
				acknowledged: command.payload.acknowledgedDuplicateTrapCode,
			});
			return updateTrap(trx, command.payload.trapId, command.payload.organizationId, {
				is_active: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'adultSurveillance.deleteTrap': {
			await applyRecordDeletion(trx, {
				recordType: 'trap',
				recordId: command.payload.trapId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedCascadeDelete: command.payload.acknowledgedCascadeDelete,
				},
			});
			const row = await trx
				.updateTable('traps')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.trapId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(returnColumns.traps)
				.executeTakeFirst();
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported trap command: ${command.type}`);
	}
}

/**
 * Refuse an edit that would leave a Trap carrying neither a name nor a code.
 *
 * The one home for the rule on the update path. The domain builder states it
 * for a create, where both values are genuinely in the payload, and cannot
 * state it here: a mutation body is a diff, so clearing the name sends that
 * column alone and the stored code never reaches the builder. Reading the rule
 * against the fields the edit named let a Trap end up with neither (#752), so
 * it is read against the row as it will stand instead.
 *
 * An edit naming only the description asks nothing and reads nothing, which is
 * the check the `relabels` line below states for the acknowledgement.
 */
async function assertTrapDisplayRemains(
	trx: AdultSurveillanceTransaction,
	input: TrapDisplayInput,
): Promise<void> {
	if (!('trapName' in input.changes || 'trapCode' in input.changes)) {
		return;
	}
	const after = await trapLabelsAfter(trx, input);
	// No such trap. The update below finds the same nothing and answers 404,
	// which is the more useful of the two refusals.
	if (after === null) {
		return;
	}
	if (carriesText(after.trapName) || carriesText(after.trapCode)) {
		return;
	}
	throw new CommandError(400, {
		error: 'trap_display_required',
		reason: 'A trap needs a name or a code. Keep one of the two.',
	});
}

interface TrapDisplayInput {
	readonly trapId: string;
	readonly organizationId: string;
	readonly changes: {
		readonly trapName?: string | null;
		readonly trapCode?: string | null;
	};
}

/**
 * The Trap's two labels as this edit will leave them, or null when there is no
 * such Trap to read.
 *
 * The incoming value for a field the edit names, the stored value for one it
 * does not. Which is the whole of why the rule cannot be a domain rule: only
 * this side has the second half.
 */
async function trapLabelsAfter(
	trx: AdultSurveillanceTransaction,
	input: TrapDisplayInput,
): Promise<{ readonly trapName: string | null; readonly trapCode: string | null } | null> {
	const stored = await trx
		.selectFrom('traps')
		.select(['trap_name', 'trap_code'])
		.where('id', '=', input.trapId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (stored === undefined) {
		return null;
	}
	return {
		trapName: 'trapName' in input.changes ? (input.changes.trapName ?? null) : stored.trap_name,
		trapCode: 'trapCode' in input.changes ? (input.changes.trapCode ?? null) : stored.trap_code,
	};
}

/**
 * Whether a label is something an operator could read a Trap back under.
 *
 * `traps.trap_name` and `traps.trap_code` are plain text with no CHECK, so a
 * row written before this rule existed can hold an empty string, which is as
 * good as absent on screen.
 */
function carriesText(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

async function updateTrap(
	trx: AdultSurveillanceTransaction,
	trapId: string,
	organizationId: string,
	set: TrapUpdateColumns,
): Promise<TrapRow | null> {
	return updateRow(trx, 'traps', trapId, organizationId, set, returnColumns.traps);
}
