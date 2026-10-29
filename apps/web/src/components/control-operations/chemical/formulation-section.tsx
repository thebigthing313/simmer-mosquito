/**
 * One side of the formulations catalog's lifecycle split, one row per mix,
 * each expanding to the products in it. The route draws it twice, for the
 * Active and the Inactive section.
 */

import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { useState } from 'react';
import type {
	FormulationComponentRecord,
	FormulationRecord,
} from '../../../hooks/queries/use-formulation-records';
import type { InsecticideRecord } from '../../../hooks/queries/use-insecticide-records';
import {
	CatalogActionsHead,
	CatalogExpandButton,
	CatalogNameCell,
	CatalogRowActions,
	CatalogSection,
	toggleCatalogActive,
} from '../../catalog';
import { insecticideDisplayName } from '../control-display';
import type { FormulationCatalog } from './formulation-catalog';
import { FormulationComponentPanel } from './formulation-component-panel';
import { FormulationDrawer } from './formulation-drawer';
import { formatAmountValue, formatAmountWithUnit, sortedComponents } from './formulation-math';

export function FormulationSection({
	catalog,
	emptyLabel,
	rows,
	title,
	tone,
}: {
	readonly catalog: FormulationCatalog;
	readonly emptyLabel: string;
	readonly rows: readonly FormulationRecord[];
	readonly title: string;
	readonly tone: 'active' | 'inactive';
}) {
	// Expand toggle + mix columns (+ actions when the viewer can manage).
	const columnCount = 4 + (catalog.canManage ? 1 : 0);

	return (
		<CatalogSection
			columns={
				<TableRow className="bg-muted/40 hover:bg-muted/40">
					<TableHead className="w-[52px]">
						<span className="sr-only">Expand Products</span>
					</TableHead>
					<TableHead className="w-[30%]">Name</TableHead>
					<TableHead>Products</TableHead>
					<TableHead className="w-[18%]">One Batch Makes</TableHead>
					{catalog.canManage ? <CatalogActionsHead /> : null}
				</TableRow>
			}
			count={rows.length}
			emptyLabel={emptyLabel}
			title={title}
		>
			{rows.map((formulation) => (
				<FormulationRow
					catalog={catalog}
					columnCount={columnCount}
					components={catalog.componentsByFormulation.get(formulation.id) ?? []}
					formulation={formulation}
					isInactive={tone === 'inactive'}
					key={formulation.id}
				/>
			))}
		</CatalogSection>
	);
}

function FormulationRow({
	catalog,
	columnCount,
	components,
	formulation,
	isInactive,
}: {
	readonly catalog: FormulationCatalog;
	readonly columnCount: number;
	readonly components: readonly FormulationComponentRecord[];
	readonly formulation: FormulationRecord;
	readonly isInactive: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const name = formulation.formulationName;

	return (
		<>
			<TableRow className={expanded ? 'border-b-0' : undefined}>
				<TableCell className="align-top">
					<div className="-my-2">
						<CatalogExpandButton
							expanded={expanded}
							label={expanded ? `Hide products in ${name}` : `Show products in ${name}`}
							onToggle={() => setExpanded((previous) => !previous)}
						/>
					</div>
				</TableCell>
				<CatalogNameCell isInactive={isInactive} name={name} />
				<TableCell className="align-top whitespace-normal text-muted-foreground wrap-anywhere">
					{componentSummary(components, catalog.insecticideById)}
				</TableCell>
				<TableCell className="align-top tabular-nums">
					{formatAmountWithUnit(
						formulation.batchSize,
						catalog.unitById.get(formulation.batchUnitId),
					)}
				</TableCell>
				{catalog.canManage ? (
					<TableCell className="align-top text-right">
						<FormulationRowActions
							catalog={catalog}
							components={components}
							formulation={formulation}
						/>
					</TableCell>
				) : null}
			</TableRow>
			{expanded ? (
				<TableRow className="hover:bg-transparent">
					<TableCell className="p-0 whitespace-normal" colSpan={columnCount}>
						<FormulationComponentPanel
							catalog={catalog}
							components={components}
							formulation={formulation}
						/>
					</TableCell>
				</TableRow>
			) : null}
		</>
	);
}

function FormulationRowActions({
	catalog,
	components,
	formulation,
}: {
	readonly catalog: FormulationCatalog;
	readonly components: readonly FormulationComponentRecord[];
	readonly formulation: FormulationRecord;
}) {
	const { canManage, mutations, units } = catalog;
	const [editOpen, setEditOpen] = useState(false);

	return (
		<>
			{/* An empty mix cannot be activated: a formulation with no products has
			    nothing to expand into applications. */}
			<CatalogRowActions
				activateLabel="Activate"
				isActive={formulation.isActive}
				name={formulation.formulationName}
				onEdit={() => setEditOpen(true)}
				onToggle={() =>
					toggleCatalogActive({
						activateVerb: 'activate',
						apply: (isActive) => mutations.setActive(formulation.id, isActive),
						isActive: formulation.isActive,
						name: formulation.formulationName,
					})
				}
				toggleDisabled={!formulation.isActive && components.length === 0}
				toggleHint="Add a product first"
			/>
			<FormulationDrawer
				canManage={canManage}
				formulation={formulation}
				mutations={mutations}
				onOpenChange={setEditOpen}
				open={editOpen}
				units={units}
			/>
		</>
	);
}

function componentSummary(
	components: readonly FormulationComponentRecord[],
	insecticideById: ReadonlyMap<string, InsecticideRecord>,
): string {
	if (components.length === 0) {
		return 'No products';
	}
	return sortedComponents(components)
		.map((component) => {
			const insecticide = insecticideById.get(component.insecticideId);
			const name = insecticide === undefined ? 'Unknown' : insecticideDisplayName(insecticide);
			return `${name} (${formatAmountValue(component.amount)})`;
		})
		.join(', ');
}
