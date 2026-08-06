import type {
	ControlMethodRow,
	FormulationRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { webCollections } from '../../sync/webCollections';
import { formatActionDate, formatAmount } from './-control-display';
import {
	addDaysToDateString,
	buildWeek,
	CONTROL_ACTIVITY_WINDOW_DAYS,
	type ControlActionKind,
	type DailyControlAction,
	dayOfMonth,
	startOfWeek,
	todayInTimeZone,
	USAGE_WINDOW_DAYS,
	type UsageWindowDays,
	useControlActionsForDay,
	useInsecticideUsage,
	useRecentBiocontrolActions,
	useRecentSourceReductions,
	weekdayLabel,
} from './-overview-data';

const ControlIcon = iconRegistry.domains.controlOperations.icon;
const ApplicationIcon = iconRegistry.entities.application.icon;
const SourceReductionIcon = iconRegistry.entities.sourceReductionAction.icon;
const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;
const InsecticideIcon = iconRegistry.entities.insecticide.icon;
const FormulationIcon = iconRegistry.entities.formulation.icon;
const MapIcon = iconRegistry.generic.map.icon;

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
	const { rows: formulations } = useCollectionRows<FormulationRow>(webCollections.formulations);
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
					<span className="font-medium text-xs uppercase tracking-wide">
						Larval &amp; adult management
					</span>
				</div>
				<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
					Control Operations
				</h1>
				<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
					The source reductions, biocontrol releases, and chemical applications your crews recorded
					over the last {CONTROL_ACTIVITY_WINDOW_DAYS} days, and the catalogs behind them.
				</p>
			</header>

			<div className="grid gap-5 xl:grid-cols-12">
				<div className="grid content-start gap-5 xl:col-span-7">
					<DailyControlActionsPanel labels={labels} today={today} />
					<InsecticideUsagePanel labels={labels} today={today} />
				</div>
				<div className="grid content-start gap-5 xl:col-span-5">
					<RecentSourceReductionsPanel labels={labels} since={since} />
					<RecentBiocontrolPanel labels={labels} since={since} />
				</div>
				<div className="xl:col-span-12">
					<CatalogPanel
						applicationMethods={applicationMethods}
						biocontrolMethods={biocontrolMethods}
						formulations={formulations}
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

/** Header shortcut from a panel to the map explorer holding the same records. */
function MapLinkButton({
	label,
	to,
}: {
	readonly label: string;
	readonly to:
		| '/control-operations/chemical'
		| '/control-operations/source-reduction'
		| '/control-operations/biocontrol';
}) {
	return (
		<Button asChild className="size-7" size="icon" variant="ghost">
			<Link aria-label={label} title={label} to={to}>
				<MapIcon aria-hidden="true" className="size-4" />
			</Link>
		</Button>
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

// --- a crew's day of control work -------------------------------------------

const UNASSIGNED_KEY = '__unassigned__';

interface CrewGroup {
	readonly key: string;
	readonly name: string;
	readonly actions: readonly DailyControlAction[];
}

function groupByCrewMember(
	actions: readonly DailyControlAction[],
	profileNameById: ReadonlyMap<string, string>,
): readonly CrewGroup[] {
	const groups = new Map<string, DailyControlAction[]>();
	for (const action of actions) {
		const key = action.performedByProfileId ?? UNASSIGNED_KEY;
		const existing = groups.get(key);
		if (existing) {
			existing.push(action);
		} else {
			groups.set(key, [action]);
		}
	}
	return [...groups.entries()]
		.map(([key, rows]) => ({
			key,
			name: key === UNASSIGNED_KEY ? 'Unassigned' : (profileNameById.get(key) ?? 'Unknown'),
			actions: rows,
		}))
		.sort((first, second) => {
			if (first.key === UNASSIGNED_KEY) {
				return 1;
			}
			if (second.key === UNASSIGNED_KEY) {
				return -1;
			}
			return first.name.localeCompare(second.name);
		});
}

/**
 * One day of control work, by whoever performed it.
 *
 * A crew's day is a mix of spraying, dipping out a source, and dropping fish, so
 * this covers all three rather than applications alone — reading one kind
 * understates what each person actually got through.
 */
function DailyControlActionsPanel({
	labels,
	today,
}: {
	readonly labels: Labels;
	readonly today: string;
}) {
	const [selectedDate, setSelectedDate] = useState(today);
	const { actions, isReady, isError } = useControlActionsForDay(selectedDate);
	const groups = useMemo(
		() => groupByCrewMember(actions, labels.profileNameById),
		[actions, labels.profileNameById],
	);

	const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
	const days = useMemo(() => buildWeek(weekStart), [weekStart]);
	// The current week is the latest browsable one; there is no future data.
	const canGoNextWeek = weekStart < startOfWeek(today);

	const goToWeek = (deltaDays: number) => {
		const shifted = addDaysToDateString(selectedDate, deltaDays);
		setSelectedDate(shifted > today ? today : shifted);
	};

	return (
		<Panel
			count={isReady ? actions.length : undefined}
			icon={<ControlIcon className="size-4" />}
			title="Daily Control Actions"
		>
			<div className="flex items-stretch gap-1 border-border/60 border-b p-3">
				<Button
					aria-label="Previous week"
					className="size-auto shrink-0 px-1.5"
					onClick={() => goToWeek(-7)}
					size="icon"
					variant="outline"
				>
					<ChevronLeftIcon aria-hidden="true" className="size-4" />
				</Button>
				<div className="grid flex-1 grid-cols-7 gap-1">
					{days.map((day) => {
						const isSelected = day === selectedDate;
						const isToday = day === today;
						const isFuture = day > today;
						return (
							<button
								className={cn(
									'flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-xs transition-colors',
									isSelected
										? 'border-primary bg-primary text-primary-foreground'
										: isFuture
											? 'cursor-not-allowed border-border/40 text-muted-foreground/40'
											: 'border-border hover:bg-accent',
								)}
								disabled={isFuture}
								key={day}
								onClick={() => setSelectedDate(day)}
								type="button"
							>
								<span className="text-[0.62rem] uppercase tracking-wide opacity-70">
									{isToday ? 'Today' : weekdayLabel(day)}
								</span>
								<span className="font-semibold tabular-nums">{dayOfMonth(day)}</span>
							</button>
						);
					})}
				</div>
				<Button
					aria-label="Next week"
					className="size-auto shrink-0 px-1.5"
					disabled={!canGoNextWeek}
					onClick={() => goToWeek(7)}
					size="icon"
					variant="outline"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Button>
			</div>

			{isError ? (
				<PanelMessage>Control activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton />
			) : groups.length === 0 ? (
				<PanelMessage>No control actions recorded on this day.</PanelMessage>
			) : (
				// A busy day can hold hundreds of actions; keep the panel a fixed,
				// internally scrolling height so the page stays balanced beside the
				// shorter right column instead of stretching to full document length.
				<div className="max-h-[32rem] divide-y divide-border/60 overflow-y-auto">
					{groups.map((group) => (
						<CrewGroupBlock group={group} key={group.key} labels={labels} />
					))}
				</div>
			)}
		</Panel>
	);
}

/** One person's day, collapsed to a summary row until opened. */
function CrewGroupBlock({ group, labels }: { readonly group: CrewGroup; readonly labels: Labels }) {
	const [open, setOpen] = useState(false);
	const PersonnelIcon = iconRegistry.entities.organization.icon;

	return (
		<Collapsible asChild onOpenChange={setOpen} open={open}>
			<section>
				<CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
					{open ? (
						<ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<ChevronRightIcon
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
					)}
					<PersonnelIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
					<span
						className={cn(
							'min-w-0 flex-1 truncate font-medium text-sm',
							group.key === UNASSIGNED_KEY && 'text-muted-foreground italic',
						)}
					>
						{group.name}
					</span>
					<span className="hidden shrink-0 truncate text-muted-foreground text-xs sm:inline">
						{kindBreakdown(group.actions)}
					</span>
					<span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
						{group.actions.length}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<ul className="grid px-3 pb-3">
						{group.actions.map((action) => (
							<ControlActionRow
								action={action}
								key={`${action.kind}:${action.id}`}
								labels={labels}
							/>
						))}
					</ul>
				</CollapsibleContent>
			</section>
		</Collapsible>
	);
}

function ControlActionRow({
	action,
	labels,
}: {
	readonly action: DailyControlAction;
	readonly labels: Labels;
}) {
	const Icon = KIND_ICON[action.kind];

	return (
		<li className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/40">
			<Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
			<div className="grid min-w-0 flex-1">
				<Link
					className="truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: action.id }}
					to={KIND_DETAIL_ROUTE[action.kind]}
				>
					{actionSubject(action, labels)}
				</Link>
				<span className="truncate text-muted-foreground text-xs">
					{actionSecondary(action, labels)}
				</span>
			</div>
			<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
				{formatAmount(action.amount, labels.unitById.get(action.unitId))}
			</span>
		</li>
	);
}

const KIND_LABEL: Record<ControlActionKind, string> = {
	application: 'application',
	sourceReduction: 'source reduction',
	biocontrol: 'biocontrol release',
};

const KIND_ICON: Record<ControlActionKind, typeof ApplicationIcon> = {
	application: ApplicationIcon,
	sourceReduction: SourceReductionIcon,
	biocontrol: BiocontrolIcon,
};

const KIND_DETAIL_ROUTE: Record<
	ControlActionKind,
	| '/control-operations/chemical/$id'
	| '/control-operations/source-reduction/$id'
	| '/control-operations/biocontrol/$id'
> = {
	application: '/control-operations/chemical/$id',
	sourceReduction: '/control-operations/source-reduction/$id',
	biocontrol: '/control-operations/biocontrol/$id',
};

const KIND_ORDER = ['application', 'sourceReduction', 'biocontrol'] as const;

/** "4 applications · 2 source reductions" — what the day was actually made of. */
function kindBreakdown(actions: readonly DailyControlAction[]): string {
	const counts = new Map<ControlActionKind, number>();
	for (const action of actions) {
		counts.set(action.kind, (counts.get(action.kind) ?? 0) + 1);
	}
	return KIND_ORDER.filter((kind) => counts.has(kind))
		.map((kind) => {
			const count = counts.get(kind) ?? 0;
			return `${count} ${KIND_LABEL[kind]}${count === 1 ? '' : 's'}`;
		})
		.join(' · ');
}

/** The product for an application; the method for the other two. */
function actionSubject(action: DailyControlAction, labels: Labels): string {
	if (action.kind === 'application') {
		return labels.insecticideNameById.get(action.subjectId) ?? 'Unknown insecticide';
	}
	if (action.kind === 'sourceReduction') {
		return labels.sourceReductionMethodNameById.get(action.subjectId) ?? 'Unknown method';
	}
	return labels.biocontrolMethodNameById.get(action.subjectId) ?? 'Unknown method';
}

function actionSecondary(action: DailyControlAction, labels: Labels): string {
	if (action.kind === 'sourceReduction') {
		return 'Source reduction';
	}
	if (action.kind === 'biocontrol') {
		return 'Biocontrol release';
	}
	const method =
		action.methodId === null
			? 'No method'
			: (labels.applicationMethodNameById.get(action.methodId) ?? 'Unknown method');
	return `Application · ${method}`;
}

// --- insecticide usage ------------------------------------------------------

/**
 * How much of each product went out over the window.
 *
 * Alphabetical rather than ranked by volume: this is read to check on a
 * particular product, and a list that reorders itself as the season shifts has to
 * be re-scanned every time. Totals stay separated by unit — the same product
 * recorded in gallons on one job and pounds on the next cannot be added up.
 */
function InsecticideUsagePanel({
	labels,
	today,
}: {
	readonly labels: Labels;
	readonly today: string;
}) {
	const [windowDays, setWindowDays] = useState<UsageWindowDays>(USAGE_WINDOW_DAYS[0]);
	const since = useMemo(() => addDaysToDateString(today, -(windowDays - 1)), [today, windowDays]);
	const { usage, isReady, isError } = useInsecticideUsage(since);

	const rows = useMemo(
		() =>
			usage
				.map((entry) => ({
					...entry,
					name: labels.insecticideNameById.get(entry.insecticideId) ?? 'Unknown insecticide',
				}))
				.sort((first, second) => first.name.localeCompare(second.name)),
		[usage, labels.insecticideNameById],
	);

	return (
		<Panel
			actions={
				<MapLinkButton label="Open the applications map" to="/control-operations/chemical" />
			}
			count={isReady ? rows.length : undefined}
			icon={<InsecticideIcon className="size-4" />}
			title="Insecticide Usage"
		>
			<div className="border-border/60 border-b p-3">
				<ToggleGroup
					aria-label="Usage window"
					className="w-full"
					onValueChange={(next: string) => {
						const parsed = Number.parseInt(next, 10);
						const match = USAGE_WINDOW_DAYS.find((days) => days === parsed);
						if (match !== undefined) {
							setWindowDays(match);
						}
					}}
					size="sm"
					type="single"
					value={String(windowDays)}
					variant="outline"
				>
					{USAGE_WINDOW_DAYS.map((days) => (
						<ToggleGroupItem className="flex-1 text-xs" key={days} value={String(days)}>
							Last {days} days
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{isError ? (
				<PanelMessage>Application activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : rows.length === 0 ? (
				<PanelMessage>No insecticide applied in the last {windowDays} days.</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{rows.map((row) => (
						<li className="flex items-center gap-3 px-4 py-2.5" key={row.insecticideId}>
							<div className="grid min-w-0 flex-1">
								<span className="truncate font-medium text-foreground text-sm">{row.name}</span>
								<span className="truncate text-muted-foreground text-xs tabular-nums">
									{row.applicationCount} application{row.applicationCount === 1 ? '' : 's'}
								</span>
							</div>
							<span className="shrink-0 text-right text-foreground text-sm tabular-nums">
								{formatUsageTotals(row.totalsByUnitId, labels)}
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

function formatUsageTotals(totalsByUnitId: ReadonlyMap<string, number>, labels: Labels): string {
	return [...totalsByUnitId.entries()]
		.map(([unitId, total]) => formatAmount(total, labels.unitById.get(unitId)))
		.join(' · ');
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
			actions={
				<MapLinkButton
					label="Open the source reductions map"
					to="/control-operations/source-reduction"
				/>
			}
			count={isReady ? sourceReductions.length : undefined}
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
			actions={
				<MapLinkButton label="Open the biocontrol map" to="/control-operations/biocontrol" />
			}
			count={isReady ? biocontrolActions.length : undefined}
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
	formulations,
	insecticides,
}: {
	readonly applicationMethods: readonly ControlMethodRow[];
	readonly sourceReductionMethods: readonly ControlMethodRow[];
	readonly biocontrolMethods: readonly ControlMethodRow[];
	readonly formulations: readonly FormulationRow[];
	readonly insecticides: readonly InsecticideRow[];
}) {
	return (
		<Panel icon={<ControlIcon className="size-4" />} title="Catalogs">
			<ul className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-5">
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
					activeCount={formulations.filter((formulation) => formulation.isActive).length}
					icon={<FormulationIcon aria-hidden="true" className="size-4" />}
					label="Formulations"
					to="/control-operations/chemical/formulations"
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
		| '/control-operations/chemical/formulations'
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
