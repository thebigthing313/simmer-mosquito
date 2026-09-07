import {
	applyRecordDeletion,
	assertWriteReferences,
	checkedValues,
	sql,
} from '@simmer-mosquito/db';
import type { AdultSurveillanceCommand } from '@simmer-mosquito/domain';
import {
	assertCitedHistoryAcknowledged,
	assertTrapCodeAcknowledged,
} from '../../record-history.js';
import {
	type AdultSurveillanceTransaction,
	resolveLocationGeom,
	surveillanceCatalogReferences,
	type TrapRow,
	type TrapUpdateColumns,
	trapReturnColumns,
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
				.returning(trapReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'adultSurveillance.updateTrapDetails':
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
				.returning(trapReturnColumns)
				.executeTakeFirst();
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported trap command: ${command.type}`);
	}
}

async function updateTrap(
	trx: AdultSurveillanceTransaction,
	trapId: string,
	organizationId: string,
	set: TrapUpdateColumns,
): Promise<TrapRow | null> {
	return updateRow(trx, 'traps', trapId, organizationId, set, trapReturnColumns);
}
