import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { AlertTriangleIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
	SPECIES_WINDOWS,
	SpeciesCompositionPanel,
	type SpeciesWindow,
	speciesWindowSince,
} from '../../components/species-composition-panel';
import { trapDisplayName } from '../../hooks/queries/trap-view';
import { useAdultSpeciesComposition } from '../../hooks/queries/use-adult-species-composition';
import { useCollectionsAwaitingIdentification } from '../../hooks/queries/use-collections-awaiting-identification';
import { useCollectionsOverThreshold } from '../../hooks/queries/use-collections-over-threshold';
import {
	type ActivityCollection,
	useRecentCollections,
} from '../../hooks/queries/use-recent-collections';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import {
	addDaysToDateString,
	formatMonthDay,
	formatWeekdayMonthDay,
	todayInTimeZone,
} from '../../lib/local-date';
import { CollectionFlagBadges, collectionEffectiveDate } from './-adult-display';

/** How far back the recent-window queries reach. */
const ADULT_ACTIVITY_WINDOW_DAYS = 14;

const AdultIcon = iconRegistry.domains.adultSurveillance.icon;
const TrapIcon = iconRegistry.entities.trap.icon;
const CollectionIcon = iconRegistry.entities.collection.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

export const Route = createFileRoute('/adult-surveillance/')({
	component: AdultSurveillanceOverviewRoute,
});

function AdultSurveillanceOverviewRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const since = addDaysToDateString(today, -(ADULT_ACTIVITY_WINDOW_DAYS - 1));

	return (
		<div className={pageContainer({ gap: 'overview', padding: 'page' })}>
			<PageHeader
				description="Collection activity across your traps, the species composition in what they caught, and the collections still awaiting identification or flagged with a problem."
				eyebrow="Surveillance & mapping"
				icon={AdultIcon}
				title="Adult Surveillance"
			/>

			<div className="grid gap-5 xl:grid-cols-12">
				<div className="xl:col-span-7">
					<RecentCollectionsPanel since={since} />
				</div>
				<div className="grid content-start gap-5 xl:col-span-5">
					<AdultSpeciesComposition today={today} />
					<AwaitingIdentificationPanel since={since} />
				</div>
				<div className="xl:col-span-12">
					<OverThresholdPanel since={since} />
				</div>
				<div className="xl:col-span-12">
					<AttentionPanel since={since} />
				</div>
			</div>
		</div>
	);
}

/** What a collection is called: the trap it came from, or that it had none. */
function collectionPrimaryLabel(collection: {
	readonly trapId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
}): string {
	if (collection.trapId === null) {
		return 'Ad-hoc collection';
	}
	return trapDisplayName({
		id: collection.trapId,
		trapName: collection.trapName,
		trapCode: collection.trapCode,
	});
}

/** A collection's date as `Wed, Aug 12` — an em dash while it is still pending. */
function collectionDayLabel(
	collection: {
		readonly collectedAt: Date | null;
		readonly collectionDate: string | null;
	},
	timeZone: string,
): string {
	return formatWeekdayMonthDay(collectionEffectiveDate(collection, timeZone) ?? '');
}

function CollectionLink({
	id,
	label,
	className,
}: {
	readonly id: string;
	readonly label: string;
	readonly className?: string;
}) {
	return (
		<Link
			className={cn(cn(recordLink({ size: 'sm' }), 'truncate'), className)}
			params={{ id }}
			to="/adult-surveillance/collections/$id"
		>
			{label}
		</Link>
	);
}

// --- recent collections (grouped by day) ------------------------------------

interface DayGroup {
	readonly day: string;
	readonly rows: readonly ActivityCollection[];
}

function groupByDay(
	collections: readonly ActivityCollection[],
	timeZone: string,
): readonly DayGroup[] {
	const groups = new Map<string, ActivityCollection[]>();
	for (const collection of collections) {
		const day = collectionEffectiveDate(collection, timeZone) ?? '';
		if (day === '') {
			continue;
		}
		const existing = groups.get(day);
		if (existing) {
			existing.push(collection);
		} else {
			groups.set(day, [collection]);
		}
	}
	// The rows arrive sorted newest-first, so day keys do too.
	return [...groups.entries()].map(([day, rows]) => ({ day, rows }));
}

function RecentCollectionsPanel({ since }: { readonly since: string }) {
	const timeZone = useOrganizationTimeZone();
	const { collections, isReady, isError } = useRecentCollections(since, timeZone);
	const groups = groupByDay(collections, timeZone);

	return (
		<Panel
			count={isReady ? collections.length : undefined}
			icon={<CollectionIcon className="size-4" />}
			title={`Recent Collections · Last ${ADULT_ACTIVITY_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Collection activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton />
			) : groups.length === 0 ? (
				<PanelMessage>
					No collections retrieved in the last {ADULT_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<div className="max-h-[32rem] divide-y divide-border/60 overflow-y-auto">
					{groups.map((group) => (
						<DayGroupBlock group={group} key={group.day} />
					))}
				</div>
			)}
		</Panel>
	);
}

function DayGroupBlock({ group }: { readonly group: DayGroup }) {
	return (
		<section className="p-3">
			<div
				className={cn(
					stickyHeader({ surface: 'card', layout: 'inline', gap: 'tight', padding: 'tight' }),
					'mb-1',
				)}
			>
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					{formatMonthDay(group.day)}
				</span>
				<span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
					{group.rows.length}
				</span>
			</div>
			<ul className="grid">
				{group.rows.map((collection) => (
					<li
						className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/40"
						key={collection.id}
					>
						<div className="grid min-w-0 flex-1">
							<CollectionLink id={collection.id} label={collectionPrimaryLabel(collection)} />
							<span className="truncate text-muted-foreground text-xs">
								{collection.methodName}
								{collection.collectedByProfileId === null
									? ''
									: ` · ${collection.collectedByName ?? 'Unknown'}`}
							</span>
						</div>
						<CollectionFlagBadges
							className="flex shrink-0 items-center gap-1.5"
							collection={collection}
						/>
					</li>
				))}
			</ul>
		</section>
	);
}

// --- species composition ----------------------------------------------------

function AdultSpeciesComposition({ today }: { readonly today: string }) {
	const [window, setWindow] = useState<SpeciesWindow>('7d');
	const { totals, grandTotal, isReady, isError } = useAdultSpeciesComposition(
		speciesWindowSince(today, window),
	);

	return (
		<SpeciesCompositionPanel
			emptySubject="specimens"
			grandTotal={grandTotal}
			isError={isError}
			isReady={isReady}
			onWindowChange={setWindow}
			totals={totals}
			window={window}
			windows={SPECIES_WINDOWS}
		/>
	);
}

// --- awaiting identification -------------------------------------------------

function AwaitingIdentificationPanel({ since }: { readonly since: string }) {
	const timeZone = useOrganizationTimeZone();
	const { awaiting, isReady, isError } = useCollectionsAwaitingIdentification(since, timeZone);

	return (
		<Panel
			count={isReady ? awaiting.length : undefined}
			footer={
				awaiting.length > 0 ? (
					<Link
						className="font-medium text-primary hover:underline"
						to="/adult-surveillance/collections"
					>
						View all collections
					</Link>
				) : undefined
			}
			icon={<SpeciesIcon className="size-4" />}
			title="Awaiting Identification"
		>
			{isError ? (
				<PanelMessage>Collection data is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : awaiting.length === 0 ? (
				<PanelMessage>No collections awaiting identification. Nice work.</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{awaiting.map((collection) => (
						<li className="flex items-center gap-3 px-4 py-2.5" key={collection.id}>
							<div className="grid min-w-0 flex-1">
								<CollectionLink id={collection.id} label={collectionPrimaryLabel(collection)} />
								<span className="truncate text-muted-foreground text-xs">
									{collection.methodName}
								</span>
							</div>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{collectionDayLabel(collection, timeZone)}
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- over action threshold --------------------------------------------------

function OverThresholdPanel({ since }: { readonly since: string }) {
	const timeZone = useOrganizationTimeZone();
	const { collections, hasConfiguredThresholds, isReady, isError } = useCollectionsOverThreshold(
		since,
		timeZone,
	);

	return (
		<Panel
			count={isReady ? collections.length : undefined}
			icon={<AlertTriangleIcon className="size-4" />}
			title={`Over Action Threshold · Last ${ADULT_ACTIVITY_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Collection activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : !hasConfiguredThresholds ? (
				// Distinct from the empty list below it. Without this an unset threshold
				// reads as a quiet fortnight.
				<PanelMessage>
					No collection method sets an action threshold.{' '}
					<Link
						className="font-medium text-primary hover:underline"
						to="/adult-surveillance/collection-methods"
					>
						Set one
					</Link>
					.
				</PanelMessage>
			) : collections.length === 0 ? (
				<PanelMessage>
					No collection reached its method's action threshold in the last{' '}
					{ADULT_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="grid gap-1 p-2 sm:grid-cols-2">
					{collections.map((collection) => (
						<li
							className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
							key={collection.id}
						>
							<span className="w-11 shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatMonthDay(collectionEffectiveDate(collection, timeZone) ?? '')}
							</span>
							{/*
							 * The reason to read this panel is to open the collection that ran
							 * hot, so the row's body goes there rather than to the trap.
							 */}
							<Link
								className="group grid min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: collection.id }}
								to="/adult-surveillance/collections/$id"
							>
								<span className="truncate font-medium text-foreground text-sm group-hover:text-primary">
									{collectionPrimaryLabel(collection)}
								</span>
								<span className="truncate text-muted-foreground text-xs">
									{collection.methodName}
								</span>
							</Link>
							<span className="shrink-0 text-sm tabular-nums">
								{/* A slash reads as nothing aloud, so the pair is spelled out. */}
								<span className="sr-only">
									{collection.total.toLocaleString('en-US')} of a threshold of{' '}
									{collection.actionThreshold.toLocaleString('en-US')}
								</span>
								<span aria-hidden="true" className="font-medium text-foreground">
									{collection.total.toLocaleString('en-US')}
								</span>
								<span aria-hidden="true" className="text-muted-foreground">
									{' / '}
									{collection.actionThreshold.toLocaleString('en-US')}
								</span>
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- attention (problem collections) ----------------------------------------

function AttentionPanel({ since }: { readonly since: string }) {
	const timeZone = useOrganizationTimeZone();
	const { collections, isReady, isError } = useRecentCollections(since, timeZone);
	const flagged = collections.filter((collection) => collection.hasProblem);

	return (
		<Panel
			count={isReady ? flagged.length : undefined}
			icon={<AlertTriangleIcon className="size-4" />}
			title={`Flagged for Attention · Last ${ADULT_ACTIVITY_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Collection activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : flagged.length === 0 ? (
				<PanelMessage>
					No collections were flagged with a problem in the last {ADULT_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="grid gap-1 p-2 sm:grid-cols-2">
					{flagged.map((collection) => (
						<li
							className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
							key={collection.id}
						>
							<TrapIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
							<div className="grid min-w-0 flex-1">
								<CollectionLink id={collection.id} label={collectionPrimaryLabel(collection)} />
								<span className="truncate text-muted-foreground text-xs">
									{collection.methodName}
								</span>
							</div>
							<span className="w-11 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
								{collectionDayLabel(collection, timeZone)}
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}
