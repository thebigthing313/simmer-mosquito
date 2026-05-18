import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useMemo, useState } from 'react';
import type {
	AdminUnit,
	CreateAdminUnitInput,
	UnitSystem,
	UnitType,
	UpdateAdminUnitInput,
} from '../api';
import {
	DeleteConfirmDialog,
	EditDialogButton,
	FormActions,
	FormGrid,
	PageHeading,
	PageShell,
	RecordActions,
	RecordRow,
	StatusMessage,
} from '../components/AdminPrimitives';
import { Panel, ToneBadge } from '../components/Panel';
import { adminCollections } from '../sync/adminCollections';
import { useCollectionRows } from '../sync/useCollectionRows';

const unitTypes = [
	'count',
	'duration',
	'distance',
	'area',
	'volume',
	'weight',
	'temperature',
	'speed',
] as const satisfies readonly UnitType[];
const unitSystems = ['si', 'imperial', 'us_customary'] as const satisfies readonly UnitSystem[];

export const Route = createFileRoute('/_authenticated/_admin/units')({
	component: UnitsRoute,
});

function UnitsRoute() {
	const { rows } = useCollectionRows(adminCollections.units);
	const units = useMemo(
		() =>
			[...rows].sort(
				(first, second) =>
					first.unitType.localeCompare(second.unitType) ||
					first.unitName.localeCompare(second.unitName),
			),
		[rows],
	);
	const unitGroups = useMemo(() => groupUnitsByType(units), [units]);
	const [form, setForm] = useState<CreateAdminUnitInput>({
		code: '',
		unitName: '',
		abbreviation: '',
		unitType: 'count',
		unitSystem: 'si',
	});
	const [status, setStatus] = useState('');

	async function submitUnit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus('Creating unit...');
		try {
			const transaction = adminCollections.units.insert(toOptimisticUnit(form));
			await transaction.isPersisted.promise;
			setForm({
				code: '',
				unitName: '',
				abbreviation: '',
				unitType: form.unitType,
				unitSystem: form.unitSystem,
			});
			setStatus('Unit created.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to create unit.');
		}
	}

	async function updateUnit(unitId: string, changes: UpdateAdminUnitInput) {
		setStatus('Updating unit...');
		try {
			const transaction = adminCollections.units.update(unitId, (draft) => {
				draft.code = changes.code.trim();
				draft.unitName = changes.unitName.trim();
				draft.abbreviation = changes.abbreviation.trim();
				draft.unitType = changes.unitType;
				draft.unitSystem = changes.unitSystem;
			});
			await transaction.isPersisted.promise;
			setStatus('Unit updated.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to update unit.');
			throw error;
		}
	}

	async function deleteUnit(unitId: string) {
		setStatus('Deleting unit...');
		try {
			const transaction = adminCollections.units.delete(unitId);
			await transaction.isPersisted.promise;
			setStatus('Unit deleted.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to delete unit.');
		}
	}

	const addUnitPanel = (
		<Panel title="Add unit">
			<form className="grid gap-4" onSubmit={submitUnit}>
				<FormGrid compact>
					<UnitFields form={form} onChange={setForm} />
				</FormGrid>
				<FormActions>
					<Button type="submit">Add unit</Button>
				</FormActions>
			</form>
		</Panel>
	);

	return (
		<PageShell className="gap-[18px]">
			<PageHeading
				description="Manage the supported measurement units used by SIMMER workflows."
				eyebrow="Global catalog"
				title="Units"
			/>

			<StatusMessage>{status}</StatusMessage>

			<div className="units-hierarchy-index">
				<div className="units-hierarchy-side">
					{addUnitPanel}
					<UnitTypeIndex groups={unitGroups} />
				</div>
				<Panel title="Units by type">
					<div className="unit-type-columns">
						{unitGroups.map((group) => (
							<UnitTypeSection
								group={group}
								key={group.type}
								onDeleteUnit={deleteUnit}
								onUpdateUnit={updateUnit}
							/>
						))}
					</div>
				</Panel>
			</div>
		</PageShell>
	);
}

function toOptimisticUnit(form: CreateAdminUnitInput) {
	return {
		id: crypto.randomUUID(),
		code: form.code.trim(),
		unitName: form.unitName.trim(),
		abbreviation: form.abbreviation.trim(),
		unitType: form.unitType,
		unitSystem: form.unitSystem,
		createdAt: new Date().toISOString(),
	};
}

function groupUnitsByType(units: readonly AdminUnit[]): readonly {
	readonly type: UnitType;
	readonly units: readonly AdminUnit[];
}[] {
	return unitTypes
		.map((unitType) => ({
			type: unitType,
			units: units.filter((unit) => unit.unitType === unitType),
		}))
		.filter((group) => group.units.length > 0);
}

function UnitTypeSection({
	group,
	onDeleteUnit,
	onUpdateUnit,
}: {
	readonly group: {
		readonly type: UnitType;
		readonly units: readonly AdminUnit[];
	};
	readonly onDeleteUnit: (unitId: string) => Promise<void>;
	readonly onUpdateUnit: (unitId: string, changes: UpdateAdminUnitInput) => Promise<void>;
}) {
	return (
		<section className="unit-type-section">
			<header className="unit-type-heading">
				<h2>{group.type}</h2>
				<span>{group.units.length} units</span>
			</header>
			<div className="unit-list">
				{group.units.map((unit) => (
					<RecordRow key={unit.id}>
						<div>
							<h3>{unit.unitName}</h3>
							<p className="code-text">
								{unit.code} / {unit.abbreviation}
							</p>
						</div>
						<RecordActions>
							<ToneBadge tone="neutral">{unit.unitSystem}</ToneBadge>
							<EditUnitDialog onSubmit={(changes) => onUpdateUnit(unit.id, changes)} unit={unit} />
							<DeleteUnitDialog onDelete={() => onDeleteUnit(unit.id)} unit={unit} />
						</RecordActions>
					</RecordRow>
				))}
			</div>
		</section>
	);
}

function UnitFields({
	form,
	onChange,
}: {
	readonly form: CreateAdminUnitInput;
	readonly onChange: (form: CreateAdminUnitInput) => void;
}) {
	return (
		<FieldGroup>
			<Field>
				<FieldLabel>Code</FieldLabel>
				<Input
					required
					value={form.code}
					onChange={(event) => onChange({ ...form, code: event.target.value })}
				/>
			</Field>
			<Field>
				<FieldLabel>Name</FieldLabel>
				<Input
					required
					value={form.unitName}
					onChange={(event) => onChange({ ...form, unitName: event.target.value })}
				/>
			</Field>
			<Field>
				<FieldLabel>Abbreviation</FieldLabel>
				<Input
					required
					value={form.abbreviation}
					onChange={(event) => onChange({ ...form, abbreviation: event.target.value })}
				/>
			</Field>
			<Field>
				<FieldLabel>Type</FieldLabel>
				<NativeSelect
					value={form.unitType}
					onChange={(event) => onChange({ ...form, unitType: event.target.value as UnitType })}
				>
					{unitTypes.map((unitType) => (
						<option key={unitType} value={unitType}>
							{unitType}
						</option>
					))}
				</NativeSelect>
			</Field>
			<Field>
				<FieldLabel>System</FieldLabel>
				<NativeSelect
					value={form.unitSystem}
					onChange={(event) => onChange({ ...form, unitSystem: event.target.value as UnitSystem })}
				>
					{unitSystems.map((unitSystem) => (
						<option key={unitSystem} value={unitSystem}>
							{unitSystem}
						</option>
					))}
				</NativeSelect>
			</Field>
		</FieldGroup>
	);
}

function EditUnitDialog({
	onSubmit,
	unit,
}: {
	readonly onSubmit: (changes: UpdateAdminUnitInput) => Promise<void>;
	readonly unit: AdminUnit;
}) {
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState<UpdateAdminUnitInput>(() => unitToForm(unit));

	async function submitEdit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await onSubmit(form);
		setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<EditDialogButton onClick={() => setForm(unitToForm(unit))} />
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit unit</DialogTitle>
					<DialogDescription>Update the supported unit catalog entry.</DialogDescription>
				</DialogHeader>
				<form className="dialog-form" onSubmit={submitEdit}>
					<UnitFields form={form} onChange={setForm} />
					<DialogFooter>
						<Button type="submit">Save unit</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteUnitDialog({
	onDelete,
	unit,
}: {
	readonly onDelete: () => Promise<void>;
	readonly unit: AdminUnit;
}) {
	return (
		<DeleteConfirmDialog
			actionLabel="Delete unit"
			description="This removes the unit from the global catalog. The server will block deletion if records still reference it."
			onDelete={onDelete}
			title={`Delete ${unit.unitName}?`}
		/>
	);
}

function unitToForm(unit: AdminUnit): UpdateAdminUnitInput {
	return {
		code: unit.code,
		unitName: unit.unitName,
		abbreviation: unit.abbreviation,
		unitType: unit.unitType,
		unitSystem: unit.unitSystem,
	};
}

function UnitTypeIndex({
	groups,
}: {
	readonly groups: readonly {
		readonly type: UnitType;
		readonly units: readonly AdminUnit[];
	}[];
}) {
	return (
		<dl className="unit-type-index">
			{groups.map((group) => (
				<div key={group.type}>
					<dt>{group.type}</dt>
					<dd>{group.units.length}</dd>
				</div>
			))}
		</dl>
	);
}
