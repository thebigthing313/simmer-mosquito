/**
 * The insecticides catalog: the products an agency applies, each expanding to
 * the lots crews draw from.
 *
 * Two record types with two sets of commands, so the surfaces live in the
 * modules beside this file (#169). This holds the two mutation hooks, the
 * batch-tracking gate, and the layout.
 */

import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import {
	CatalogGroupHeader,
	CatalogInactiveDisclosure,
	CatalogNote,
	CatalogPage,
} from '../../../components/catalog';
import {
	useInsecticideBatchMutations,
	useInsecticideMutations,
} from '../../../hooks/mutations/use-insecticide-mutations';
import { useInsecticideRecords } from '../../../hooks/queries/use-insecticide-records';
import { type UnitType, useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { InsecticideDrawer } from './-insecticide-drawer';
import { InsecticideTable } from './-insecticide-table';

export const Route = createFileRoute('/control-operations/chemical/insecticides')({
	component: InsecticidesRoute,
});

const InsecticideIcon = iconRegistry.entities.insecticide.icon;
const AddIcon = iconRegistry.actions.add.icon;

/** Amounts are recorded per product, so only these unit types are offered. */
const USAGE_UNIT_TYPES = new Set<UnitType>(['volume', 'weight', 'count']);

function InsecticidesRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, settings } = useOrganizationWorkspace(auth.snapshot);

	// insecticides and units sync eagerly; only the batches are on-demand.
	const insecticides = useInsecticideRecords();
	const mutations = useInsecticideMutations();
	const batchMutations = useInsecticideBatchMutations();
	const { all: unitRows } = useUnitLabels();

	const units = useMemo(
		() =>
			unitRows
				.filter((unit) => USAGE_UNIT_TYPES.has(unit.unitType))
				.slice()
				.sort(
					(first, second) =>
						first.unitType.localeCompare(second.unitType) ||
						first.unitName.localeCompare(second.unitName),
				),
		[unitRows],
	);
	const activeInsecticides = insecticides.filter((row) => row.isActive);
	const inactiveInsecticides = insecticides.filter((row) => !row.isActive);
	const batchTrackingEnabled = settings.controlOperations.trackInsecticideBatches;

	// The header and the empty state offer the same way in, so they mount the
	// same drawer rather than each spelling out its own trigger.
	const addInsecticideDrawer = (
		<InsecticideDrawer
			canManage={canManage}
			mutations={mutations}
			trigger={
				<Button type="button">
					<AddIcon aria-hidden="true" />
					Add Insecticide
				</Button>
			}
			units={units}
		/>
	);

	return (
		<CatalogPage
			action={canManage ? addInsecticideDrawer : undefined}
			canEdit={canManage}
			description="The products your agency applies — active ingredient, EPA registration number, default usage unit, and the lots crews draw from."
			emptyDescription={
				<>
					Insecticides are the products behind every chemical application record.
					{canManage
						? ' Add your first product to get started.'
						: ' An owner or admin can add products for your agency.'}
				</>
			}
			emptyTitle="No Insecticides Yet"
			icon={InsecticideIcon}
			isEmpty={insecticides.length === 0}
			title="Insecticides"
		>
			<section className="grid gap-2">
				<CatalogGroupHeader
					active={activeInsecticides.length}
					description="Expand a product to manage the lots or batches crews draw from."
					inactive={inactiveInsecticides.length}
					title="Products"
				/>
				{batchTrackingEnabled ? null : <BatchTrackingDisabledNotice />}
				{activeInsecticides.length === 0 ? (
					<CatalogNote>No active insecticides.</CatalogNote>
				) : (
					<InsecticideTable
						allInsecticides={insecticides}
						batchMutations={batchMutations}
						batchTrackingEnabled={batchTrackingEnabled}
						canManage={canManage}
						insecticides={activeInsecticides}
						mutations={mutations}
						units={units}
					/>
				)}
				{inactiveInsecticides.length > 0 ? (
					<CatalogInactiveDisclosure count={inactiveInsecticides.length}>
						<InsecticideTable
							allInsecticides={insecticides}
							batchMutations={batchMutations}
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							insecticides={inactiveInsecticides}
							mutations={mutations}
							units={units}
						/>
					</CatalogInactiveDisclosure>
				) : null}
			</section>
		</CatalogPage>
	);
}

/** Batches stay editable while tracking is off; the application form stops asking for one. */
function BatchTrackingDisabledNotice() {
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
