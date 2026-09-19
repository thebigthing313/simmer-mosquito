/**
 * The batches under one product. The route owns the batch-tracking gate; a
 * product under a closed gate draws a disabled list.
 */

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { InsecticideBatchMutations } from '../../../hooks/mutations/use-insecticide-mutations';
import { useInsecticideBatches } from '../../../hooks/queries/use-insecticide-batches';
import type {
	InsecticideBatchRecord,
	InsecticideRecord,
} from '../../../hooks/queries/use-insecticide-records';
import { CatalogDetailPanel, CatalogInactiveDisclosure, CatalogNote } from '../../catalog';
import { DeleteInsecticideBatchDialog, InsecticideBatchDrawer } from './batch-drawer';
import type { InsecticideCatalog } from './insecticide-catalog';

const AddIcon = iconRegistry.actions.add.icon;
const EditIcon = iconRegistry.actions.edit.icon;

/**
 * Batches for one product, mounted only while its row is expanded so the
 * on-demand batch subscription stays scoped to the products a user opens.
 */
export function InsecticideBatchPanel({
	catalog,
	insecticide,
}: {
	readonly catalog: InsecticideCatalog;
	readonly insecticide: InsecticideRecord;
}) {
	const { allProducts, batchMutations, batchTrackingEnabled, canManage } = catalog;
	const { batches, isReady, isError } = useInsecticideBatches(insecticide.id);
	const canManageBatches = canManage && batchTrackingEnabled;
	const activeBatches = batches.filter((batch) => batch.isActive);
	const inactiveBatches = batches.filter((batch) => !batch.isActive);

	return (
		<CatalogDetailPanel
			action={
				<InsecticideBatchDrawer
					allProducts={allProducts}
					canManage={canManageBatches}
					defaultInsecticideId={insecticide.id}
					lockInsecticide
					mutations={batchMutations}
					trigger={
						<Button disabled={!canManageBatches} size="sm" type="button" variant="outline">
							<AddIcon aria-hidden="true" />
							Add Batch
						</Button>
					}
				/>
			}
			summary={isError ? 'Unavailable' : !isReady ? 'Loading…' : batchGroupSummary(batches)}
			title="Batches"
		>
			{isError ? (
				<CatalogNote compact>Batches could not be loaded. Try again shortly.</CatalogNote>
			) : !isReady ? (
				<Skeleton className="h-16 w-full" />
			) : (
				<>
					<InsecticideBatchList
						allProducts={allProducts}
						batches={activeBatches}
						canManage={canManageBatches}
						disabled={!batchTrackingEnabled}
						emptyLabel="No active batches."
						mutations={batchMutations}
					/>
					{inactiveBatches.length > 0 ? (
						<CatalogInactiveDisclosure count={inactiveBatches.length}>
							<InsecticideBatchList
								allProducts={allProducts}
								batches={inactiveBatches}
								canManage={canManageBatches}
								disabled={!batchTrackingEnabled}
								emptyLabel="No inactive batches."
								mutations={batchMutations}
							/>
						</CatalogInactiveDisclosure>
					) : null}
				</>
			)}
		</CatalogDetailPanel>
	);
}

function InsecticideBatchList({
	allProducts,
	batches,
	canManage,
	disabled,
	emptyLabel,
	mutations,
}: {
	/** Every product, so an edit can move a batch to any of them. */
	readonly allProducts: readonly InsecticideRecord[];
	readonly batches: readonly InsecticideBatchRecord[];
	readonly canManage: boolean;
	readonly disabled: boolean;
	readonly emptyLabel: string;
	readonly mutations: InsecticideBatchMutations;
}) {
	if (batches.length === 0) {
		return <CatalogNote compact>{emptyLabel}</CatalogNote>;
	}

	return (
		<div
			aria-disabled={disabled}
			className="overflow-x-auto rounded-md border border-border/40 data-[disabled=true]:bg-muted/30"
			data-disabled={disabled}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Batch</TableHead>
						{canManage ? <TableHead className="w-24 text-right">Actions</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{batches.map((batch) => (
						<TableRow key={batch.id}>
							<TableCell className="font-medium">{batch.batchName}</TableCell>
							{canManage ? (
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										<InsecticideBatchDrawer
											allProducts={allProducts}
											batch={batch}
											canManage={canManage}
											mutations={mutations}
											trigger={
												<Button size="icon" type="button" variant="outline">
													<EditIcon aria-hidden="true" />
													<span className="sr-only">Edit {batch.batchName}</span>
												</Button>
											}
										/>
										<DeleteInsecticideBatchDialog batch={batch} mutations={mutations} />
									</div>
								</TableCell>
							) : null}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function batchGroupSummary(batches: readonly InsecticideBatchRecord[]): string {
	if (batches.length === 0) {
		return 'No batches recorded';
	}
	const activeCount = batches.filter((batch) => batch.isActive).length;
	return `${activeCount} active, ${batches.length - activeCount} inactive`;
}
