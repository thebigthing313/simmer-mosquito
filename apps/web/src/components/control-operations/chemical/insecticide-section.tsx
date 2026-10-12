/**
 * One side of the insecticides catalog's lifecycle split, one row per product,
 * each expanding to its batches. The route draws it twice, for the Active and
 * the Inactive section, so the rows arrive separately from the catalog the
 * batch drawer picks from.
 */

import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { useState } from 'react';
import type { InsecticideRecord } from '../../../hooks/queries/use-insecticide-records';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { titleCaseToken } from '../../../lib/record-display';
import {
	CatalogActionsHead,
	CatalogExpandButton,
	CatalogNameCell,
	CatalogRowActions,
	CatalogSection,
	toggleCatalogActive,
} from '../../catalog';
import { InsecticideBatchPanel } from './batch-panel';
import type { InsecticideCatalog } from './insecticide-catalog';
import { InsecticideDrawer } from './insecticide-drawer';

export function InsecticideSection({
	catalog,
	emptyLabel,
	rows,
	title,
	tone,
}: {
	readonly catalog: InsecticideCatalog;
	readonly emptyLabel: string;
	/** The subset of the catalog this section draws as rows. */
	readonly rows: readonly InsecticideRecord[];
	readonly title: string;
	readonly tone: 'active' | 'inactive';
}) {
	const { canManage } = catalog;
	// Expand toggle + product columns (+ actions when the viewer can manage).
	const columnCount = 5 + (canManage ? 1 : 0);

	return (
		<CatalogSection
			columns={
				<TableRow className="bg-muted/40 hover:bg-muted/40">
					<TableHead className="w-[52px]">
						<span className="sr-only">Expand Batches</span>
					</TableHead>
					<TableHead className="w-[30%]">Trade Name</TableHead>
					<TableHead>Active Ingredient</TableHead>
					<TableHead className="w-[16%]">Type</TableHead>
					<TableHead className="w-[18%]">Default Usage Unit</TableHead>
					{canManage ? <CatalogActionsHead /> : null}
				</TableRow>
			}
			count={rows.length}
			emptyLabel={emptyLabel}
			title={title}
		>
			{rows.map((insecticide) => (
				<InsecticideRow
					catalog={catalog}
					columnCount={columnCount}
					insecticide={insecticide}
					isInactive={tone === 'inactive'}
					key={insecticide.id}
				/>
			))}
		</CatalogSection>
	);
}

function InsecticideRow({
	catalog,
	columnCount,
	insecticide,
	isInactive,
}: {
	readonly catalog: InsecticideCatalog;
	readonly columnCount: number;
	readonly insecticide: InsecticideRecord;
	readonly isInactive: boolean;
}) {
	const { canManage, units } = catalog;
	const [expanded, setExpanded] = useState(false);
	const productLabel = insecticide.tradeName;

	return (
		<>
			<TableRow className={expanded ? 'border-b-0' : undefined}>
				<TableCell className="align-top">
					<div className="-my-2">
						<CatalogExpandButton
							expanded={expanded}
							label={
								expanded ? `Hide batches for ${productLabel}` : `Show batches for ${productLabel}`
							}
							onToggle={() => setExpanded((previous) => !previous)}
						/>
					</div>
				</TableCell>
				<CatalogNameCell isInactive={isInactive} name={productLabel} />
				<TableCell className="align-top whitespace-normal wrap-anywhere">
					{insecticide.activeIngredient}
				</TableCell>
				<TableCell className="align-top">{titleCaseToken(insecticide.type)}</TableCell>
				<TableCell className="align-top">{unitLabel(units, insecticide.defaultUnitId)}</TableCell>
				{canManage ? (
					<TableCell className="align-top text-right">
						<InsecticideRowActions catalog={catalog} insecticide={insecticide} />
					</TableCell>
				) : null}
			</TableRow>
			{expanded ? (
				<TableRow className="hover:bg-transparent">
					<TableCell className="p-0 whitespace-normal" colSpan={columnCount}>
						<InsecticideBatchPanel catalog={catalog} insecticide={insecticide} />
					</TableCell>
				</TableRow>
			) : null}
		</>
	);
}

function InsecticideRowActions({
	catalog,
	insecticide,
}: {
	readonly catalog: InsecticideCatalog;
	readonly insecticide: InsecticideRecord;
}) {
	const { canManage, mutations, units } = catalog;
	const [editOpen, setEditOpen] = useState(false);

	return (
		<>
			{/* No confirm step; the server rejects a deactivation it disallows. */}
			<CatalogRowActions
				isActive={insecticide.isActive}
				name={insecticide.tradeName}
				onEdit={() => setEditOpen(true)}
				onToggle={() =>
					toggleCatalogActive({
						apply: (isActive) => mutations.setActive(insecticide.id, isActive),
						isActive: insecticide.isActive,
						name: insecticide.tradeName,
					})
				}
			/>
			<InsecticideDrawer
				canManage={canManage}
				insecticide={insecticide}
				mutations={mutations}
				onOpenChange={setEditOpen}
				open={editOpen}
				units={units}
			/>
		</>
	);
}

function unitLabel(units: readonly UnitLabel[], unitId: string): string {
	const unit = units.find((item) => item.id === unitId);
	return unit === undefined ? 'Not set' : unit.abbreviation || unit.unitName;
}
