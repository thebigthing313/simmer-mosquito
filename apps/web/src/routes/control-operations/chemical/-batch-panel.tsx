/**
 * The batches under one product, and the notice that says they are not in use.
 *
 * Everything here is the batch half of the insecticides catalog. The route owns
 * the batch-tracking gate and passes it down; this decides what the gate looks
 * like once it is off.
 */

import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
import {
	CatalogDetailPanel,
	CatalogInactiveDisclosure,
	CatalogNote,
} from '../../../components/catalog';
import type { InsecticideBatchMutations } from '../../../hooks/mutations/use-insecticide-mutations';
import {
	type InsecticideBatchRecord,
	type InsecticideRecord,
	useInsecticideBatches,
} from '../../../hooks/queries/use-insecticide-records';
import { DeleteInsecticideBatchDialog, InsecticideBatchDrawer } from './-batch-drawer';

const AddIcon = iconRegistry.actions.add.icon;
const EditIcon = iconRegistry.actions.edit.icon;

export function BatchTrackingDisabledNotice() {
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-muted/40 px-3 py-2.5">
			<div className="flex flex-wrap items-center gap-2">
				<strong className="text-foreground text-sm">Batch tracking is off</strong>
				<Badge tone="neutral" variant="outline">
					Tracking off
				</Badge>
			</div>
			<p className="m-0 text-muted-foreground text-xs leading-snug">
				Saved batches are retained, but application records will not ask crews to select one until
				an owner or admin turns tracking on under My Organization → Insecticides.
			</p>
		</div>
	);
}

/**
 * Batches for one product, revealed when its row is expanded. Mounting lazily
 * (only while expanded) keeps the on-demand batch subscription scoped to the
 * products a user actually opens.
 */
export function InsecticideBatchPanel({
	batchTrackingEnabled,
	canManage,
	insecticide,
	insecticides,
	mutations,
}: {
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly insecticide: InsecticideRecord;
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: InsecticideBatchMutations;
}) {
	const { batches, isReady, isError } = useInsecticideBatches(insecticide.id);
	const canManageBatches = canManage && batchTrackingEnabled;
	const activeBatches = batches.filter((batch) => batch.isActive);
	const inactiveBatches = batches.filter((batch) => !batch.isActive);

	return (
		<CatalogDetailPanel
			action={
				<InsecticideBatchDrawer
					canManage={canManageBatches}
					defaultInsecticideId={insecticide.id}
					insecticides={insecticides}
					lockInsecticide
					mutations={mutations}
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
						batches={activeBatches}
						canManage={canManageBatches}
						disabled={!batchTrackingEnabled}
						emptyLabel="No active batches."
						insecticides={insecticides}
						mutations={mutations}
					/>
					{inactiveBatches.length > 0 ? (
						<CatalogInactiveDisclosure count={inactiveBatches.length}>
							<InsecticideBatchList
								batches={inactiveBatches}
								canManage={canManageBatches}
								disabled={!batchTrackingEnabled}
								emptyLabel="No inactive batches."
								insecticides={insecticides}
								mutations={mutations}
							/>
						</CatalogInactiveDisclosure>
					) : null}
				</>
			)}
		</CatalogDetailPanel>
	);
}

function InsecticideBatchList({
	batches,
	canManage,
	disabled,
	emptyLabel,
	insecticides,
	mutations,
}: {
	readonly batches: readonly InsecticideBatchRecord[];
	readonly canManage: boolean;
	readonly disabled: boolean;
	readonly emptyLabel: string;
	readonly insecticides: readonly InsecticideRecord[];
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
											batch={batch}
											canManage={canManage}
											insecticides={insecticides}
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
