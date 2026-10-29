/**
 * The formulations catalog: the mixes an organization applies, each expanding
 * to the products in it.
 *
 * The surfaces live in the modules beside the insecticide ones; this holds the
 * reads, the search and the layout.
 */

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { CatalogFilteredList, CatalogPage } from '../../../components/catalog';
import type { FormulationCatalog } from '../../../components/control-operations/chemical/formulation-catalog';
import { FormulationDrawer } from '../../../components/control-operations/chemical/formulation-drawer';
import { FormulationSection } from '../../../components/control-operations/chemical/formulation-section';
import { useCatalogSearch } from '../../../hooks/catalog/use-catalog-search';
import { useFormulationMutations } from '../../../hooks/mutations/use-formulation-mutations';
import { useFormulationComponents } from '../../../hooks/queries/use-formulation-components';
import {
	type FormulationRecord,
	useFormulationRecords,
} from '../../../hooks/queries/use-formulation-records';
import { useInsecticideRecords } from '../../../hooks/queries/use-insecticide-records';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';

export const Route = createFileRoute('/control-operations/chemical/formulations')({
	component: FormulationsRoute,
});

const FormulationIcon = iconRegistry.entities.formulation.icon;
const AddIcon = iconRegistry.actions.add.icon;

function matchesFormulation(row: FormulationRecord, query: string): boolean {
	return (
		row.formulationName.toLowerCase().includes(query) ||
		(row.description ?? '').toLowerCase().includes(query)
	);
}

function FormulationsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage } = useOrganizationWorkspace(auth.snapshot);

	// formulations, their components, insecticides, and units all sync eagerly, so
	// the whole catalog is a client-side grouping rather than a per-row subscription.
	const formulations = useFormulationRecords();
	const componentsByFormulation = useFormulationComponents();
	const insecticideRows = useInsecticideRecords();
	const mutations = useFormulationMutations();
	const { all: unitRows } = useUnitLabels();
	const search = useCatalogSearch(
		formulations.filter((row) => row.isActive),
		formulations.filter((row) => !row.isActive),
		matchesFormulation,
	);

	const catalog: FormulationCatalog = {
		canManage,
		componentsByFormulation,
		insecticideById: new Map(insecticideRows.map((row) => [row.id, row] as const)),
		insecticides: insecticideRows,
		mutations,
		unitById: new Map(unitRows.map((row) => [row.id, row] as const)),
		units: unitRows,
	};

	// The header and the empty state offer the same way in, so they mount the
	// same drawer rather than each spelling out its own trigger.
	const addFormulationDrawer = (
		<FormulationDrawer
			canManage={canManage}
			mutations={mutations}
			trigger={
				<Button type="button">
					<AddIcon aria-hidden="true" />
					Add Formulation
				</Button>
			}
			units={unitRows}
		/>
	);

	return (
		<CatalogPage
			action={canManage ? addFormulationDrawer : undefined}
			canEdit={canManage}
			description="Expand a mix to manage the products in it."
			emptyDescription={
				<>
					A formulation records a mix once — 0.5 lb of product into 26 gallons of water — so an
					application can be entered as the amount of mix that went out.
					{canManage
						? ' Add your first mix to get started.'
						: ' An owner or admin can add mixes for you.'}
				</>
			}
			emptyTitle="No Formulations Yet"
			icon={FormulationIcon}
			isEmpty={formulations.length === 0}
			title="Formulations"
		>
			<CatalogFilteredList
				noun="formulations"
				search={search}
				searchLabel="Search formulations by name or description"
				searchPlaceholder="Search formulations…"
			>
				<FormulationSection
					catalog={catalog}
					emptyLabel={
						search.query.length > 0
							? 'No active formulations match your search.'
							: 'No active formulations.'
					}
					rows={search.filteredActive}
					title="Active"
					tone="active"
				/>
				{search.inactiveCount > 0 ? (
					<FormulationSection
						catalog={catalog}
						emptyLabel="No inactive formulations match your search."
						rows={search.filteredInactive}
						title="Inactive"
						tone="inactive"
					/>
				) : null}
			</CatalogFilteredList>
		</CatalogPage>
	);
}
