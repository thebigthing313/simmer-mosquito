/**
 * The product table, one row per insecticide, each expanding to its batches.
 *
 * The route renders this twice, once for the active products and once inside
 * the retired disclosure, which is why the rows it draws and the full product
 * list arrive as separate props: the batch drawer picks from every product, not
 * from the half this table happens to be showing.
 */

import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import {
	CatalogExpandButton,
	CatalogLifecycleButton,
	toggleCatalogActive,
} from '../../../components/catalog';
import type {
	InsecticideBatchMutations,
	InsecticideMutations,
} from '../../../hooks/mutations/use-insecticide-mutations';
import type { InsecticideRecord } from '../../../hooks/queries/use-insecticide-records';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { hasMetadata, titleCaseToken } from '../../../lib/record-display';
import { InsecticideBatchPanel } from './-batch-panel';
import { InsecticideDrawer } from './-insecticide-drawer';

const EditIcon = iconRegistry.actions.edit.icon;

export function InsecticideTable({
	allInsecticides,
	batchTrackingEnabled,
	canManage,
	insecticides,
	batchMutations,
	mutations,
	units,
}: {
	/** Full product list, which feeds the batch drawer's insecticide selector. */
	readonly allInsecticides: readonly InsecticideRecord[];
	readonly batchMutations: InsecticideBatchMutations;
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	/** The subset of products this table renders as rows. */
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: InsecticideMutations;
	readonly units: readonly UnitLabel[];
}) {
	// Expand toggle + product columns (+ actions when the viewer can manage).
	const columnCount = 7 + (canManage ? 1 : 0);

	return (
		<div className="overflow-x-auto rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead className="w-10">
							<span className="sr-only">Expand batches</span>
						</TableHead>
						<TableHead>Trade Name</TableHead>
						<TableHead>Active Ingredient</TableHead>
						<TableHead className="w-28">Type</TableHead>
						<TableHead className="w-36">Default Usage Unit</TableHead>
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="w-28">Metadata</TableHead>
						{canManage ? (
							<TableHead className="w-24 text-right">
								<span className="sr-only">Actions</span>
							</TableHead>
						) : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{insecticides.map((insecticide) => (
						<InsecticideTableRow
							batchMutations={batchMutations}
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							columnCount={columnCount}
							insecticide={insecticide}
							insecticides={allInsecticides}
							key={insecticide.id}
							mutations={mutations}
							units={units}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function InsecticideTableRow({
	batchTrackingEnabled,
	canManage,
	columnCount,
	insecticide,
	insecticides,
	batchMutations,
	mutations,
	units,
}: {
	readonly batchMutations: InsecticideBatchMutations;
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly columnCount: number;
	readonly insecticide: InsecticideRecord;
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: InsecticideMutations;
	readonly units: readonly UnitLabel[];
}) {
	const [expanded, setExpanded] = useState(false);
	const productLabel = insecticide.tradeName;

	return (
		<>
			<TableRow className="border-b-0">
				<TableCell className="align-middle">
					<CatalogExpandButton
						expanded={expanded}
						label={
							expanded ? `Hide batches for ${productLabel}` : `Show batches for ${productLabel}`
						}
						onToggle={() => setExpanded((previous) => !previous)}
					/>
				</TableCell>
				<TableCell className="font-medium">{productLabel}</TableCell>
				<TableCell>{insecticide.activeIngredient}</TableCell>
				<TableCell>{titleCaseToken(insecticide.type)}</TableCell>
				<TableCell>{unitLabel(units, insecticide.defaultUnitId)}</TableCell>
				<TableCell>
					{insecticide.isActive ? (
						'Active'
					) : (
						<Badge tone="neutral" variant="outline">
							Inactive
						</Badge>
					)}
				</TableCell>
				<TableCell>{hasMetadata(insecticide.metadata) ? 'Configured' : 'None'}</TableCell>
				{canManage ? (
					<TableCell className="text-right">
						<div className="flex justify-end gap-2">
							<InsecticideDrawer
								canManage={canManage}
								insecticide={insecticide}
								mutations={mutations}
								tooltip="Edit"
								trigger={
									<Button size="icon" type="button" variant="outline">
										<EditIcon aria-hidden="true" />
										<span className="sr-only">Edit {insecticide.tradeName}</span>
									</Button>
								}
								units={units}
							/>
							{/* No confirm step; the server rejects a deactivation it disallows. */}
							<CatalogLifecycleButton
								isActive={insecticide.isActive}
								name={insecticide.tradeName}
								onToggle={() =>
									toggleCatalogActive({
										apply: (isActive) => mutations.setActive(insecticide.id, isActive),
										isActive: insecticide.isActive,
										name: insecticide.tradeName,
									})
								}
							/>
						</div>
					</TableCell>
				) : null}
			</TableRow>
			{expanded ? (
				<TableRow className="hover:bg-transparent">
					<TableCell className="p-0" colSpan={columnCount}>
						<InsecticideBatchPanel
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							insecticide={insecticide}
							insecticides={insecticides}
							mutations={batchMutations}
						/>
					</TableCell>
				</TableRow>
			) : null}
		</>
	);
}

function unitLabel(units: readonly UnitLabel[], unitId: string): string {
	const unit = units.find((item) => item.id === unitId);
	return unit === undefined ? 'Not set' : unit.abbreviation || unit.unitName;
}
