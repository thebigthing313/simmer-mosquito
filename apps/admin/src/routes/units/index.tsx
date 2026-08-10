import type { UnitRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { ListEmpty } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useLiveQuery } from '@tanstack/react-db';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { UnitSystem, UnitType } from '../../api';
import { AdminPage } from '../../components/admin-page';
import {
	CatalogBody,
	CatalogDialog,
	type CatalogDialogState,
	CatalogForm,
	CatalogList,
	CatalogRow,
	DeleteRecordButton,
	EditRecordButton,
	useCatalogForm,
} from '../../components/catalog';
import { adminCollections } from '../../sync/adminCollections';

const UnitIcon = iconRegistry.entities.unit.icon;
const AddIcon = iconRegistry.actions.add.icon;

export const Route = createFileRoute('/units/')({
	component: UnitsRoute,
});

/** The quantities SIMMER measures. Order is the reading order of the page. */
const UNIT_TYPES: readonly UnitType[] = [
	'area',
	'count',
	'distance',
	'duration',
	'speed',
	'temperature',
	'volume',
	'weight',
];

const UNIT_SYSTEMS: readonly { readonly value: UnitSystem; readonly label: string }[] = [
	{ value: 'si', label: 'SI' },
	{ value: 'imperial', label: 'Imperial' },
	{ value: 'us_customary', label: 'US customary' },
];

interface UnitFormValues {
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}

const EMPTY_UNIT: UnitFormValues = {
	code: '',
	unitName: '',
	abbreviation: '',
	unitType: 'count',
	unitSystem: 'si',
};

type UnitDialog = CatalogDialogState<UnitRow>;

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
	const unitsResult = useLiveQuery((query) => query.from({ row: adminCollections.units }), []);
	const [search, setSearch] = useState('');
	const [dialog, setDialog] = useState<UnitDialog>(null);

	const all = (unitsResult.data ?? []) as readonly UnitRow[];

	const grouped = useMemo(() => {
		const query = search.trim().toLowerCase();
		const rows = all.filter(
			(unit) =>
				query === '' ||
				unit.unitName.toLowerCase().includes(query) ||
				unit.code.toLowerCase().includes(query) ||
				unit.abbreviation.toLowerCase().includes(query),
		);
		return UNIT_TYPES.map((unitType) => ({
			unitType,
			units: rows
				.filter((unit) => unit.unitType === unitType)
				.sort((a, b) => a.unitName.localeCompare(b.unitName)),
		})).filter((group) => group.units.length > 0);
	}, [all, search]);

	const shown = grouped.reduce((sum, group) => sum + group.units.length, 0);

	async function createUnit(values: UnitFormValues) {
		await settleWrite(
			adminCollections.units.insert({
				id: crypto.randomUUID(),
				code: values.code.trim(),
				unitName: values.unitName.trim(),
				abbreviation: values.abbreviation.trim(),
				unitType: values.unitType,
				unitSystem: values.unitSystem,
				createdAt: new Date().toISOString(),
			} as UnitRow),
		);
		toast.success(`${values.unitName.trim()} added.`);
	}

	async function saveUnit(unitId: string, values: UnitFormValues) {
		await settleWrite(
			adminCollections.units.update(unitId, (draft) => {
				const writable = draft as { -readonly [K in keyof UnitRow]: UnitRow[K] };
				writable.code = values.code.trim();
				writable.unitName = values.unitName.trim();
				writable.abbreviation = values.abbreviation.trim();
				writable.unitType = values.unitType;
				writable.unitSystem = values.unitSystem;
			}),
		);
		toast.success(`${values.unitName.trim()} updated.`);
	}

	async function removeUnit(unit: UnitRow) {
		try {
			await settleWrite(adminCollections.units.delete(unit.id));
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
			description="Units of measure available to every agency, grouped by the quantity they measure."
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
				isReady={unitsResult.isReady}
				noun="units"
				onSearchChange={setSearch}
				search={search}
				shown={shown}
				total={all.length}
			>
				<div className="grid gap-5">
					{grouped.map((group) => (
						<UnitTypeSection
							key={group.unitType}
							onDelete={removeUnit}
							onEdit={setDialog}
							unitType={group.unitType}
							units={group.units}
						/>
					))}
				</div>
			</CatalogBody>

			<CatalogDialog
				createDescription="Added to the global list every agency measures in."
				createTitle="Add Unit"
				editDescription="Changes apply to every agency using this unit."
				editTitle={(unit) => `Edit ${unit.unitName}`}
				onClose={() => setDialog(null)}
				state={dialog}
			>
				{({ row, submitLabel }) => (
					<UnitForm
						key={row?.id ?? 'new'}
						onCancel={() => setDialog(null)}
						onSubmit={async (values) => {
							await (row === null ? createUnit(values) : saveUnit(row.id, values));
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
										unitType: row.unitType as UnitType,
										unitSystem: row.unitSystem as UnitSystem,
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
	readonly units: readonly UnitRow[];
	readonly onEdit: (unit: UnitRow) => void;
	readonly onDelete: (unit: UnitRow) => Promise<void>;
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
									consequence={`${unit.unitName} will be removed for every agency. The server will refuse this while any record measures in it.`}
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
	return UNIT_SYSTEMS.find((entry) => entry.value === system)?.label ?? system;
}

function UnitForm({
	values,
	submitLabel,
	onCancel,
	onSubmit,
}: {
	readonly values: UnitFormValues;
	readonly submitLabel: string;
	readonly onCancel: () => void;
	readonly onSubmit: (values: UnitFormValues) => Promise<void>;
}) {
	const form = useCatalogForm({ initial: values, onSubmit });
	const { values: draft, setValues } = form;

	return (
		<CatalogForm
			disabled={
				draft.code.trim() === '' || draft.unitName.trim() === '' || draft.abbreviation.trim() === ''
			}
			error={form.error}
			onCancel={onCancel}
			onSubmit={form.submit}
			pending={form.pending}
			submitLabel={submitLabel}
		>
			<Field>
				<FieldLabel htmlFor="unit-name">Name</FieldLabel>
				<Input
					id="unit-name"
					maxLength={120}
					onChange={(event) => setValues({ ...draft, unitName: event.target.value })}
					placeholder="e.g. hectare"
					required
					value={draft.unitName}
				/>
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="unit-code">Code</FieldLabel>
					<Input
						id="unit-code"
						maxLength={32}
						onChange={(event) => setValues({ ...draft, code: event.target.value })}
						placeholder="e.g. hectare"
						required
						value={draft.code}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="unit-abbreviation">Abbreviation</FieldLabel>
					<Input
						id="unit-abbreviation"
						maxLength={16}
						onChange={(event) => setValues({ ...draft, abbreviation: event.target.value })}
						placeholder="e.g. ha"
						required
						value={draft.abbreviation}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="unit-type">Measures</FieldLabel>
					<NativeSelect
						id="unit-type"
						onChange={(event) => setValues({ ...draft, unitType: event.target.value as UnitType })}
						value={draft.unitType}
					>
						{UNIT_TYPES.map((unitType) => (
							<option key={unitType} value={unitType}>
								{titleCase(unitType)}
							</option>
						))}
					</NativeSelect>
				</Field>
				<Field>
					<FieldLabel htmlFor="unit-system">System</FieldLabel>
					<NativeSelect
						id="unit-system"
						onChange={(event) =>
							setValues({ ...draft, unitSystem: event.target.value as UnitSystem })
						}
						value={draft.unitSystem}
					>
						{UNIT_SYSTEMS.map((system) => (
							<option key={system.value} value={system.value}>
								{system.label}
							</option>
						))}
					</NativeSelect>
				</Field>
			</div>
		</CatalogForm>
	);
}
