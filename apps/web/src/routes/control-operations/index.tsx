import type { ControlMethodRow, InsecticideRow, ProfileRow, UnitRow } from '@simmer-mosquito/sync';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Card } from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { webCollections } from '../../sync/webCollections';
import { formatActionDate, formatAmount } from './-control-display';
import {
	addDaysToDateString,
	CONTROL_ACTIVITY_WINDOW_DAYS,
	type RecentApplication,
	todayInTimeZone,
	useRecentApplications,
	useRecentBiocontrolActions,
	useRecentSourceReductions,
} from './-overview-data';

const ControlIcon = iconRegistry.domains.controlOperations.icon;
const ApplicationIcon = iconRegistry.entities.application.icon;
const SourceReductionIcon = iconRegistry.entities.sourceReductionAction.icon;
const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;
const InsecticideIcon = iconRegistry.entities.insecticide.icon;

export const Route = createFileRoute('/control-operations/')({
	component: ControlOperationsOverviewRoute,
});

function ControlOperationsOverviewRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const since = useMemo(
		() => addDaysToDateString(today, -(CONTROL_ACTIVITY_WINDOW_DAYS - 1)),
		[today],
	);

	const { rows: applicationMethods } = useCollectionRows<ControlMethodRow>(
		webCollections.applicationMethods,
	);
	const { rows: sourceReductionMethods } = useCollectionRows<ControlMethodRow>(
		webCollections.sourceReductionMethods,
	);
	const { rows: biocontrolMethods } = useCollectionRows<ControlMethodRow>(
		webCollections.biocontrolMethods,
	);
	const { rows: insecticides } = useCollectionRows<InsecticideRow>(webCollections.insecticides);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	const labels = useMemo<Labels>(
		() => ({
			applicationMethodNameById: new Map(
				applicationMethods.map((method) => [method.id, method.name] as const),
			),
			sourceReductionMethodNameById: new Map(
				sourceReductionMethods.map((method) => [method.id, method.name] as const),
			),
			biocontrolMethodNameById: new Map(
				biocontrolMethods.map((method) => [method.id, method.name] as const),
			),
			insecticideNameById: new Map(
				insecticides.map((insecticide) => [insecticide.id, insecticide.tradeName] as const),
			),
			unitById: new Map(units.map((unit) => [unit.id, unit] as const)),
			profileNameById: new Map(
				profiles.map((profile) => [profile.id, profile.displayName] as const),
			),
		}),
		[applicationMethods, sourceReductionMethods, biocontrolMethods, insecticides, units, profiles],
	);

	return (
		<div className={pageContainer({ gap: 'overview', padding: 'page' })}>
			<header className="grid gap-1.5">
				<div className="flex items-center gap-2 text-muted-foreground">
					<ControlIcon aria-hidden="true" className="size-4" />
					<span className="font-medium text-xs uppercase tracking-wide">Control operations</span>
				</div>
				<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
					Control Overview
				</h1>
				<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
					The chemical applications, source reductions, and biocontrol releases your crews have
					recorded over the last {CONTROL_ACTIVITY_WINDOW_DAYS} days, and the catalogs behind them.
				</p>
			</header>

			<div className="grid gap-5 xl:grid-cols-12">
				<div className="xl:col-span-7">
					<RecentApplicationsPanel labels={labels} since={since} />
				</div>
				<div className="grid content-start gap-5 xl:col-span-5">
					<RecentSourceReductionsPanel labels={labels} since={since} />
					<RecentBiocontrolPanel labels={labels} since={since} />
				</div>
				<div className="xl:col-span-12">
					<CatalogPanel
						applicationMethods={applicationMethods}
						biocontrolMethods={biocontrolMethods}
						insecticides={insecticides}
						sourceReductionMethods={sourceReductionMethods}
					/>
				</div>
			</div>
		</div>
	);
}

interface Labels {
	readonly applicationMethodNameById: ReadonlyMap<string, string>;
	readonly sourceReductionMethodNameById: ReadonlyMap<string, string>;
	readonly biocontrolMethodNameById: ReadonlyMap<string, string>;
	readonly insecticideNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<string, UnitRow>;
	readonly profileNameById: ReadonlyMap<string, string>;
}

// --- shared panel chrome ----------------------------------------------------

function Panel({
	icon,
	title,
	count,
	footer,
	children,
}: {
	readonly icon: ReactNode;
	readonly title: string;
	readonly count?: number | undefined;
	readonly footer?: ReactNode;
	readonly children: ReactNode;
}) {
	return (
		<Card className="overflow-hidden" variant="panel">
			<div className="flex items-center justify-between gap-3 border-border/60 border-b px-4 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<span className="text-muted-foreground">{icon}</span>
					<h2 className="m-0 truncate font-semibold text-foreground text-sm leading-none">
						{title}
					</h2>
					{typeof count === 'number' ? (
						<span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
							{count}
						</span>
					) : null}
				</div>
			</div>
			<div className="min-w-0">{children}</div>
			{footer ? (
				<div className="border-border/60 border-t px-4 py-2.5 text-sm">{footer}</div>
			) : null}
		</Card>
	);
}

function PanelMessage({ children }: { readonly children: ReactNode }) {
	return <p className="m-0 px-4 py-8 text-center text-muted-foreground text-sm">{children}</p>;
}

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'] as const;

function RowSkeleton({ count = 4 }: { readonly count?: number }) {
	return (
		<div aria-hidden="true" className="grid gap-2 p-4">
			{SKELETON_KEYS.slice(0, count).map((key) => (
				<Skeleton className="h-11 w-full rounded-md" key={key} />
			))}
		</div>
	);
}

function ActionRow({
	primary,
	secondary,
	amount,
	date,
	icon,
	to,
	params,
}: {
	readonly primary: string;
	readonly secondary: string;
	readonly amount: string;
	readonly date: string;
	readonly icon: ReactNode;
	readonly to:
		| '/control-operations/chemical/$id'
		| '/control-operations/source-reduction/$id'
		| '/control-operations/biocontrol/$id';
	readonly params: { readonly id: string };
}) {
	return (
		<li className="flex items-center gap-3 px-4 py-2.5">
			<span className="shrink-0 text-muted-foreground">{icon}</span>
			<div className="grid min-w-0 flex-1">
				<Link
					className="truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={params}
					to={to}
				>
					{primary}
				</Link>
				<span className="truncate text-muted-foreground text-xs">{secondary}</span>
			</div>
			<span className="shrink-0 text-muted-foreground text-xs tabular-nums">{amount}</span>
			<span className="w-16 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
				{date}
			</span>
		</li>
	);
}

// --- chemical applications --------------------------------------------------

function RecentApplicationsPanel({
	labels,
	since,
}: {
	readonly labels: Labels;
	readonly since: string;
}) {
	const { applications, isReady, isError } = useRecentApplications(since);

	return (
		<Panel
			count={isReady ? applications.length : undefined}
			footer={
				<Link
					className="font-medium text-primary hover:underline"
					to="/control-operations/chemical"
				>
					View all applications
				</Link>
			}
			icon={<ApplicationIcon className="size-4" />}
			title={`Chemical applications · last ${CONTROL_ACTIVITY_WINDOW_DAYS} days`}
		>
			{isError ? (
				<PanelMessage>Application activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={4} />
			) : applications.length === 0 ? (
				<PanelMessage>
					No chemical applications recorded in the last {CONTROL_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{applications.map((application) => (
						<ActionRow
							amount={formatAmount(
								application.amountApplied,
								labels.unitById.get(application.applicationUnitId),
							)}
							date={formatActionDate(application.applicationDate)}
							icon={<ApplicationIcon aria-hidden="true" className="size-4" />}
							key={application.id}
							params={{ id: application.id }}
							primary={
								labels.insecticideNameById.get(application.insecticideId) ?? 'Unknown insecticide'
							}
							secondary={applicationSecondary(application, labels)}
							to="/control-operations/chemical/$id"
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

function applicationSecondary(application: RecentApplication, labels: Labels): string {
	const method =
		application.applicationMethodId === null
			? 'No method'
			: (labels.applicationMethodNameById.get(application.applicationMethodId) ?? 'Unknown method');
	const applicator =
		application.applicatorProfileId === null
			? null
			: (labels.profileNameById.get(application.applicatorProfileId) ?? 'Unknown');
	return applicator === null ? method : `${method} · ${applicator}`;
}

// --- source reductions ------------------------------------------------------

function RecentSourceReductionsPanel({
	labels,
	since,
}: {
	readonly labels: Labels;
	readonly since: string;
}) {
	const { sourceReductions, isReady, isError } = useRecentSourceReductions(since);

	return (
		<Panel
			count={isReady ? sourceReductions.length : undefined}
			footer={
				<Link
					className="font-medium text-primary hover:underline"
					to="/control-operations/source-reduction"
				>
					View all source reductions
				</Link>
			}
			icon={<SourceReductionIcon className="size-4" />}
			title="Source Reductions"
		>
			{isError ? (
				<PanelMessage>Source reduction activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : sourceReductions.length === 0 ? (
				<PanelMessage>
					No source reductions recorded in the last {CONTROL_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{sourceReductions.map((sourceReduction) => (
						<ActionRow
							amount={formatAmount(
								sourceReduction.sourcesEliminatedAmount,
								labels.unitById.get(sourceReduction.sourcesEliminatedUnitId),
							)}
							date={formatActionDate(sourceReduction.sourceReductionDate)}
							icon={<SourceReductionIcon aria-hidden="true" className="size-4" />}
							key={sourceReduction.id}
							params={{ id: sourceReduction.id }}
							primary={
								labels.sourceReductionMethodNameById.get(sourceReduction.sourceReductionMethodId) ??
								'Unknown method'
							}
							secondary={technicianLabel(sourceReduction.technicianProfileId, labels)}
							to="/control-operations/source-reduction/$id"
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- biocontrol -------------------------------------------------------------

function RecentBiocontrolPanel({
	labels,
	since,
}: {
	readonly labels: Labels;
	readonly since: string;
}) {
	const { biocontrolActions, isReady, isError } = useRecentBiocontrolActions(since);

	return (
		<Panel
			count={isReady ? biocontrolActions.length : undefined}
			footer={
				<Link
					className="font-medium text-primary hover:underline"
					to="/control-operations/biocontrol"
				>
					View all biocontrol releases
				</Link>
			}
			icon={<BiocontrolIcon className="size-4" />}
			title="Biocontrol Releases"
		>
			{isError ? (
				<PanelMessage>Biocontrol activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : biocontrolActions.length === 0 ? (
				<PanelMessage>
					No biocontrol releases recorded in the last {CONTROL_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{biocontrolActions.map((action) => (
						<ActionRow
							amount={formatAmount(
								action.amountReleased,
								labels.unitById.get(action.releaseUnitId),
							)}
							date={formatActionDate(action.biocontrolDate)}
							icon={<BiocontrolIcon aria-hidden="true" className="size-4" />}
							key={action.id}
							params={{ id: action.id }}
							primary={
								labels.biocontrolMethodNameById.get(action.biocontrolMethodId) ?? 'Unknown method'
							}
							secondary={technicianLabel(action.technicianProfileId, labels)}
							to="/control-operations/biocontrol/$id"
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

function technicianLabel(profileId: string | null, labels: Labels): string {
	if (profileId === null) {
		return 'No technician recorded';
	}
	return labels.profileNameById.get(profileId) ?? 'Unknown technician';
}

// --- catalogs ---------------------------------------------------------------

function CatalogPanel({
	applicationMethods,
	sourceReductionMethods,
	biocontrolMethods,
	insecticides,
}: {
	readonly applicationMethods: readonly ControlMethodRow[];
	readonly sourceReductionMethods: readonly ControlMethodRow[];
	readonly biocontrolMethods: readonly ControlMethodRow[];
	readonly insecticides: readonly InsecticideRow[];
}) {
	return (
		<Panel icon={<ControlIcon className="size-4" />} title="Catalogs">
			<ul className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-4">
				<CatalogTile
					activeCount={applicationMethods.filter((method) => method.isActive).length}
					icon={<ApplicationIcon aria-hidden="true" className="size-4" />}
					label="Application methods"
					to="/control-operations/chemical/methods"
				/>
				<CatalogTile
					activeCount={insecticides.filter((insecticide) => insecticide.isActive).length}
					icon={<InsecticideIcon aria-hidden="true" className="size-4" />}
					label="Insecticides"
					to="/control-operations/chemical/insecticides"
				/>
				<CatalogTile
					activeCount={sourceReductionMethods.filter((method) => method.isActive).length}
					icon={<SourceReductionIcon aria-hidden="true" className="size-4" />}
					label="Source reduction methods"
					to="/control-operations/source-reduction/methods"
				/>
				<CatalogTile
					activeCount={biocontrolMethods.filter((method) => method.isActive).length}
					icon={<BiocontrolIcon aria-hidden="true" className="size-4" />}
					label="Biocontrol methods"
					to="/control-operations/biocontrol/methods"
				/>
			</ul>
		</Panel>
	);
}

function CatalogTile({
	activeCount,
	icon,
	label,
	to,
}: {
	readonly activeCount: number;
	readonly icon: ReactNode;
	readonly label: string;
	readonly to:
		| '/control-operations/chemical/methods'
		| '/control-operations/chemical/insecticides'
		| '/control-operations/source-reduction/methods'
		| '/control-operations/biocontrol/methods';
}) {
	return (
		<li>
			<Link
				className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				to={to}
			>
				<span className="shrink-0 text-muted-foreground">{icon}</span>
				<span className="grid min-w-0 flex-1">
					<span className="truncate font-medium text-foreground text-sm">{label}</span>
					<span className="text-muted-foreground text-xs tabular-nums">{activeCount} active</span>
				</span>
			</Link>
		</li>
	);
}
