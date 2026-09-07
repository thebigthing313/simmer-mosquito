import { UNIT_TYPES } from '@simmer-mosquito/domain';
import { ListEmpty } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminPage } from '../../components/admin-page';
import {
	CatalogBody,
	CatalogDialog,
	type CatalogDialogState,
	CatalogList,
	CatalogRow,
	DeleteRecordButton,
	EditRecordButton,
} from '../../components/catalog';
import { type UnitListing, useUnitCatalog } from '../../hooks/queries/use-unit-catalog';
import { createUnit, deleteUnit, type UnitType, updateUnit } from '../../lib/collections/writes';
import { EMPTY_UNIT, UNIT_SYSTEM_OPTIONS, UnitForm, type UnitFormValues } from './-unit-form';

const UnitIcon = iconRegistry.entities.unit.icon;
const AddIcon = iconRegistry.actions.add.icon;

export const Route = createFileRoute('/units/')({
	component: UnitsRoute,
});

/** The quantities SIMMER measures, alphabetical, which is how the page reads them. */
const UNIT_TYPE_OPTIONS: readonly UnitType[] = [...UNIT_TYPES].sort();

type UnitDialog = CatalogDialogState<UnitListing>;

/** The fields the filter reads. The query arrives trimmed and lowercased. */
function matchesUnit(unit: UnitListing, query: string): boolean {
	return (
		unit.unitName.toLowerCase().includes(query) ||
		unit.code.toLowerCase().includes(query) ||
		unit.abbreviation.toLowerCase().includes(query)
	);
}

/**
 * The surviving rows bucketed by what they measure, empty quantities dropped.
 *
 * The rows arrive sorted by name, so bucketing preserves that order. This is a
 * display concern only: the counts the toolbar reports come from the frame,
 * which sees the rows before they are split up.
 */
function groupByUnitType(
	units: readonly UnitListing[],
): readonly { readonly unitType: UnitType; readonly units: readonly UnitListing[] }[] {
	return UNIT_TYPE_OPTIONS.map((unitType) => ({
		unitType,
		units: units.filter((unit) => unit.unitType === unitType),
	})).filter((group) => group.units.length > 0);
}

/**
 * The global unit list, grouped by what it measures.
 *
 * Grouping by quantity rather than listing A–Z is the whole point of this page:
 * an operator adding "hectare" needs to see the other area units to know whether
 * it is already there under another name, and an alphabetical list puts hectare
 * between grams and inches.
 *
 * The groups are section headings over one continuous list rather than eight
 * cards. Eight equal boxes would say the quantities are eight separate things to
 * compare; they are one list with a sort order.
 */
function UnitsRoute() {
	const { units: all, isReady } = useUnitCatalog();
	const [dialog, setDialog] = useState<UnitDialog>(null);

	function trimmed(values: UnitFormValues) {
		return {
			code: values.code.trim(),
			unitName: values.unitName.trim(),
			abbreviation: values.abbreviation.trim(),
			unitType: values.unitType,
			unitSystem: values.unitSystem,
		};
	}

	async function addUnit(values: UnitFormValues) {
		const written = trimmed(values);
		await createUnit(written);
		toast.success(`${written.unitName} added.`);
	}

	async function saveUnit(unitId: string, values: UnitFormValues) {
		const written = trimmed(values);
		await updateUnit(unitId, written);
		toast.success(`${written.unitName} updated.`);
	}

	async function removeUnit(unit: UnitListing) {
		try {
			await deleteUnit(unit.id);
			toast.success(`${unit.unitName} deleted.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to delete the unit.');
		}
	}

	return (
		<AdminPage
			actions={
				<Button onClick={() => setDialog('new')} type="button">
					<AddIcon aria-hidden="true" />
					Add Unit
				</Button>
			}
			description="Units of measure available to everyone, grouped by the quantity they measure."
			icon={UnitIcon}
			title="Units"
		>
			<CatalogBody
				empty={
					<ListEmpty
						action={
							<Button onClick={() => setDialog('new')} type="button">
								<AddIcon aria-hidden="true" />
								Add Unit
							</Button>
						}
						description="Formulations, applications, and samples all record against a unit."
						icon={UnitIcon}
						title="No units yet"
					/>
				}
				isReady={isReady}
				matches={matchesUnit}
				noun="units"
				rows={all}
			>
				{(units) => (
					<div className="grid gap-5">
						{groupByUnitType(units).map((group) => (
							<UnitTypeSection
								key={group.unitType}
								onDelete={removeUnit}
								onEdit={setDialog}
								unitType={group.unitType}
								units={group.units}
							/>
						))}
					</div>
				)}
			</CatalogBody>

			<CatalogDialog
				createDescription="Added to the global list everyone measures in."
				createTitle="Add Unit"
				editDescription="Changes apply to everyone using this unit."
				editTitle={(unit) => `Edit ${unit.unitName}`}
				onClose={() => setDialog(null)}
				state={dialog}
			>
				{({ row, submitLabel }) => (
					<UnitForm
						key={row?.id ?? 'new'}
						onCancel={() => setDialog(null)}
						onSubmit={async (values) => {
							await (row === null ? addUnit(values) : saveUnit(row.id, values));
							setDialog(null);
						}}
						submitLabel={submitLabel}
						values={
							row === null
								? EMPTY_UNIT
								: {
										code: row.code,
										unitName: row.unitName,
										abbreviation: row.abbreviation,
										unitType: row.unitType,
										unitSystem: row.unitSystem,
									}
						}
					/>
				)}
			</CatalogDialog>
		</AdminPage>
	);
}

/**
 * One quantity's units, under a section heading.
 *
 * A section heading over a continuous list rather than a card per quantity:
 * eight equal boxes would say these are eight separate things to compare, when
 * they are one list with a sort order.
 */
function UnitTypeSection({
	unitType,
	units,
	onEdit,
	onDelete,
}: {
	readonly unitType: UnitType;
	readonly units: readonly UnitListing[];
	readonly onEdit: (unit: UnitListing) => void;
	readonly onDelete: (unit: UnitListing) => Promise<void>;
}) {
	return (
		<section className="grid gap-2">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="m-0 font-bold text-[0.78rem] text-muted-foreground uppercase tracking-wide">
					{titleCase(unitType)}
				</h2>
				<span className="text-muted-foreground text-xs tabular-nums">{units.length}</span>
			</div>
			<CatalogList>
				{units.map((unit) => (
					<CatalogRow
						actions={
							<>
								<EditRecordButton label={`Edit ${unit.unitName}`} onClick={() => onEdit(unit)} />
								<DeleteRecordButton
									consequence={`${unit.unitName} will be removed for everyone. The server will refuse this while any record measures in it.`}
									onDelete={() => void onDelete(unit)}
									recordLabel={unit.unitName}
								/>
							</>
						}
						badges={
							<>
								{/*
								 * The abbreviation is what appears on a form beside a number, so
								 * it reads as data rather than as a label.
								 */}
								<span className="font-mono text-muted-foreground text-xs">{unit.abbreviation}</span>
								<Badge tone="neutral" variant="outline">
									{systemLabel(unit.unitSystem)}
								</Badge>
							</>
						}
						key={unit.id}
						subtitle={unit.code}
						title={unit.unitName}
					/>
				))}
			</CatalogList>
		</section>
	);
}

function titleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function systemLabel(system: string): string {
	return UNIT_SYSTEM_OPTIONS.find((entry) => entry.value === system)?.label ?? system;
}
