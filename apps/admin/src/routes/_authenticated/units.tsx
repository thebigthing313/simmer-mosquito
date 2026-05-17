import { createRoute } from '@tanstack/react-router';
import { type FormEvent, useMemo, useState } from 'react';
import type { AdminUnit, CreateAdminUnitInput, UnitSystem, UnitType } from '../../api';
import { Panel } from '../../components/Panel';
import { adminCollections } from '../../sync/adminCollections';
import { useCollectionRows } from '../../sync/useCollectionRows';
import { adminLayoutRoute } from './_admin';

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

export const unitsRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/units',
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

	const addUnitPanel = (
		<Panel title="Add unit">
			<form className="form-grid compact" onSubmit={submitUnit}>
				<label>
					Code
					<input
						required
						value={form.code}
						onChange={(event) => setForm({ ...form, code: event.target.value })}
					/>
				</label>
				<label>
					Name
					<input
						required
						value={form.unitName}
						onChange={(event) => setForm({ ...form, unitName: event.target.value })}
					/>
				</label>
				<label>
					Abbreviation
					<input
						required
						value={form.abbreviation}
						onChange={(event) => setForm({ ...form, abbreviation: event.target.value })}
					/>
				</label>
				<label>
					Type
					<select
						value={form.unitType}
						onChange={(event) => setForm({ ...form, unitType: event.target.value as UnitType })}
					>
						{unitTypes.map((unitType) => (
							<option key={unitType} value={unitType}>
								{unitType}
							</option>
						))}
					</select>
				</label>
				<label>
					System
					<select
						value={form.unitSystem}
						onChange={(event) => setForm({ ...form, unitSystem: event.target.value as UnitSystem })}
					>
						{unitSystems.map((unitSystem) => (
							<option key={unitSystem} value={unitSystem}>
								{unitSystem}
							</option>
						))}
					</select>
				</label>
				<div className="form-actions full">
					<button className="button" type="submit">
						Add unit
					</button>
				</div>
			</form>
		</Panel>
	);

	return (
		<section className="shell wide management-page">
			<header className="page-heading">
				<div>
					<p className="eyebrow">Global catalog</p>
					<h1>Units</h1>
					<p>Manage the supported measurement units used by SIMMER workflows.</p>
				</div>
			</header>

			{status === '' ? null : <p className="status">{status}</p>}

			<div className="units-hierarchy-index">
				<div className="units-hierarchy-side">
					{addUnitPanel}
					<UnitTypeIndex groups={unitGroups} />
				</div>
				<Panel title="Units by type">
					<div className="unit-type-columns">
						{unitGroups.map((group) => (
							<UnitTypeSection group={group} key={group.type} />
						))}
					</div>
				</Panel>
			</div>
		</section>
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
}: {
	readonly group: {
		readonly type: UnitType;
		readonly units: readonly AdminUnit[];
	};
}) {
	return (
		<section className="unit-type-section">
			<header className="unit-type-heading">
				<h2>{group.type}</h2>
				<span>{group.units.length} units</span>
			</header>
			<div className="unit-list">
				{group.units.map((unit) => (
					<article className="unit-item" key={unit.id}>
						<div>
							<h3>{unit.unitName}</h3>
							<p className="code-text">
								{unit.code} / {unit.abbreviation}
							</p>
						</div>
						<span className="badge neutral">{unit.unitSystem}</span>
					</article>
				))}
			</div>
		</section>
	);
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
