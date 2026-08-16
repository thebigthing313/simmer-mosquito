import type { UnitDefaults } from '@simmer-mosquito/domain';
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
import {
	type ControlActionKind,
	type DailyControlAction,
	useControlActionsForDay,
} from '../../hooks/queries/use-control-actions-for-day';
import { useControlCatalogCounts } from '../../hooks/queries/use-control-catalog-counts';
import { useInsecticideUsage } from '../../hooks/queries/use-insecticide-usage';
import { useOrganizationSettings } from '../../hooks/queries/use-organization-settings';
import {
	type RecentControlAction,
	useRecentBiocontrolActions,
	useRecentSourceReductions,
} from '../../hooks/queries/use-recent-control-actions';
import { useUnitLabels } from '../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { formatActionDate, formatMeasure, usageTotal } from './-control-display';
import {
	addDaysToDateString,
	buildWeek,
	CONTROL_ACTIVITY_WINDOW_DAYS,
	dayOfMonth,
	startOfWeek,
	todayInTimeZone,
	USAGE_WINDOW_DAYS,
	type UsageWindowDays,
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
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const since = useMemo(
		() => addDaysToDateString(today, -(CONTROL_ACTIVITY_WINDOW_DAYS - 1)),
		[today],
	);

	// Which unit the agency wants each kind of quantity reported in. Falls back
	// to the domain defaults while the organization row is still syncing, so the
	// widget renders a total rather than waiting on a setting.
	const { unitDefaults } = useOrganizationSettings();

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
					<DailyControlActionsPanel today={today} />
					<InsecticideUsagePanel today={today} unitDefaults={unitDefaults} />
				</div>
				<div className="grid content-start gap-5 xl:col-span-5">
					<RecentSourceReductionsPanel since={since} />
					<RecentBiocontrolPanel since={since} />
				</div>
				<div className="xl:col-span-12">
					<CatalogPanel />
				</div>
			</div>
		</div>
	);
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
	/**
	 * Only where rows differ. A list where every row carries the same glyph is
	 * a column of identical marks that says nothing the panel header has not
	 * already said, and costs the primary label the width.
	 */
	readonly icon?: ReactNode;
	readonly to:
		| '/control-operations/chemical/$id'
		| '/control-operations/source-reduction/$id'
		| '/control-operations/biocontrol/$id';
	readonly params: { readonly id: string };
}) {
	return (
		<li className="flex items-center gap-3 px-4 py-2.5">
			{icon === undefined ? null : <span className="shrink-0 text-muted-foreground">{icon}</span>}
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

function groupByCrewMember(actions: readonly DailyControlAction[]): readonly CrewGroup[] {
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
			// The name rides on the rows, so a group takes it from its first one —
			// they all name the same person, that being what grouped them.
			name: key === UNASSIGNED_KEY ? 'Unassigned' : (rows[0]?.performedByName ?? 'Unknown'),
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
function DailyControlActionsPanel({ today }: { readonly today: string }) {
	const [selectedDate, setSelectedDate] = useState(today);
	const { actions, isReady, isError } = useControlActionsForDay(selectedDate);
	const groups = useMemo(() => groupByCrewMember(actions), [actions]);

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
						<CrewGroupBlock group={group} key={group.key} />
					))}
				</div>
			)}
		</Panel>
	);
}

/** One person's day, collapsed to a summary row until opened. */
function CrewGroupBlock({ group }: { readonly group: CrewGroup }) {
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
							<ControlActionRow action={action} key={`${action.kind}:${action.id}`} />
						))}
					</ul>
				</CollapsibleContent>
			</section>
		</Collapsible>
	);
}

function ControlActionRow({ action }: { readonly action: DailyControlAction }) {
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
					{action.subjectName}
				</Link>
				<span className="truncate text-muted-foreground text-xs">{actionSecondary(action)}</span>
			</div>
			<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
				{formatMeasure(action.amount, action.unitAbbreviation)}
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

/**
 * What kind of work the row was, under the name of what it was done with.
 *
 * Only an application qualifies further, because only an application has a method
 * separate from its subject: a source reduction and a biocontrol release are both
 * titled by their method already, and naming it twice reads as a stutter.
 */
function actionSecondary(action: DailyControlAction): string {
	if (action.kind === 'sourceReduction') {
		return 'Source reduction';
	}
	if (action.kind === 'biocontrol') {
		return 'Biocontrol release';
	}
	return `Application · ${action.methodName ?? 'No method'}`;
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
	today,
	unitDefaults,
}: {
	readonly today: string;
	readonly unitDefaults: UnitDefaults;
}) {
	const [windowDays, setWindowDays] = useState<UsageWindowDays>(USAGE_WINDOW_DAYS[0]);
	const since = useMemo(() => addDaysToDateString(today, -(windowDays - 1)), [today, windowDays]);
	const { usage, isReady, isError } = useInsecticideUsage(since);
	// The one place a unit lookup is still right: a product's total spans every
	// unit its applications were recorded in, which is not a fact one row carries.
	const units = useUnitLabels();

	const rows = useMemo(
		() =>
			usage
				.map((entry) => ({
					...entry,
					total: usageTotal({
						totalsByUnitId: entry.totalsByUnitId,
						unitById: units.byId,
						unitByCode: units.byCode,
						unitDefaults,
					}),
				}))
				.sort((first, second) => first.name.localeCompare(second.name)),
		[usage, units, unitDefaults],
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
							<span
								className="shrink-0 text-right text-foreground text-sm tabular-nums"
								title={row.total.convertedFrom ?? undefined}
							>
								{row.total.text}
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- source reductions ------------------------------------------------------

function RecentSourceReductionsPanel({ since }: { readonly since: string }) {
	const { actions, isReady, isError } = useRecentSourceReductions(since);

	return (
		<Panel
			actions={
				<MapLinkButton
					label="Open the source reductions map"
					to="/control-operations/source-reduction"
				/>
			}
			count={isReady ? actions.length : undefined}
			icon={<SourceReductionIcon className="size-4" />}
			scrollBody
			title="Source Reductions"
		>
			{isError ? (
				<PanelMessage>Source reduction activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : actions.length === 0 ? (
				<PanelMessage>
					No source reductions recorded in the last {CONTROL_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{actions.map((action) => (
						<ActionRow
							amount={formatMeasure(action.amount, action.unitAbbreviation)}
							date={formatActionDate(action.actionDate)}
							key={action.id}
							params={{ id: action.id }}
							primary={action.methodName}
							secondary={technicianLabel(action)}
							to="/control-operations/source-reduction/$id"
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- biocontrol -------------------------------------------------------------

function RecentBiocontrolPanel({ since }: { readonly since: string }) {
	const { actions, isReady, isError } = useRecentBiocontrolActions(since);

	return (
		<Panel
			actions={
				<MapLinkButton label="Open the biocontrol map" to="/control-operations/biocontrol" />
			}
			count={isReady ? actions.length : undefined}
			icon={<BiocontrolIcon className="size-4" />}
			scrollBody
			title="Biocontrol Releases"
		>
			{isError ? (
				<PanelMessage>Biocontrol activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : actions.length === 0 ? (
				<PanelMessage>
					No biocontrol releases recorded in the last {CONTROL_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{actions.map((action) => (
						<ActionRow
							amount={formatMeasure(action.amount, action.unitAbbreviation)}
							date={formatActionDate(action.actionDate)}
							key={action.id}
							params={{ id: action.id }}
							primary={action.methodName}
							secondary={technicianLabel(action)}
							to="/control-operations/biocontrol/$id"
						/>
					))}
				</ul>
			)}
		</Panel>
	);
}

function technicianLabel(action: RecentControlAction): string {
	if (action.technicianProfileId === null) {
		return 'No technician recorded';
	}
	return action.technicianName ?? 'Unknown technician';
}

// --- catalogs ---------------------------------------------------------------

function CatalogPanel() {
	const counts = useControlCatalogCounts();

	return (
		<Panel icon={<ControlIcon className="size-4" />} title="Catalogs">
			<ul className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-5">
				<CatalogTile
					activeCount={counts.applicationMethods}
					icon={<ApplicationIcon aria-hidden="true" className="size-4" />}
					label="Application methods"
					to="/control-operations/chemical/methods"
				/>
				<CatalogTile
					activeCount={counts.insecticides}
					icon={<InsecticideIcon aria-hidden="true" className="size-4" />}
					label="Insecticides"
					to="/control-operations/chemical/insecticides"
				/>
				<CatalogTile
					activeCount={counts.formulations}
					icon={<FormulationIcon aria-hidden="true" className="size-4" />}
					label="Formulations"
					to="/control-operations/chemical/formulations"
				/>
				<CatalogTile
					activeCount={counts.sourceReductionMethods}
					icon={<SourceReductionIcon aria-hidden="true" className="size-4" />}
					label="Source reduction methods"
					to="/control-operations/source-reduction/methods"
				/>
				<CatalogTile
					activeCount={counts.biocontrolMethods}
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
