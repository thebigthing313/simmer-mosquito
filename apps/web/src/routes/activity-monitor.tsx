import { mapFamily } from '@simmer-mosquito/design-tokens';
import type { ActivityFamily } from '@simmer-mosquito/domain';
import { Autocomplete } from '@simmer-mosquito/ui-web/components/ui/autocomplete';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { DateRangeFilter } from '../components/date-range-filter';
import {
	ExplorerMapPage,
	useDateRangeFilters,
	useExplorerPanel,
	usePersonnelOptions,
} from '../components/explorer';
import { MapCanvas } from '../components/map';
import { useAuthSnapshot } from '../hooks/use-auth-snapshot';
import { useOrganizationTimeZone } from '../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../lib/local-date';
import {
	dateParam,
	type FilterCodecs,
	searchValidator,
	textParam,
	useSearchFilters,
} from '../lib/search-filters';
import { ActivityFocusCard, ActivityLog } from './-activity-log';
import {
	ACTIVITY_FAMILY_LABELS,
	ACTIVITY_RANGE_COPY,
	activityPanelState,
	countActivityByFamily,
	useActivityLookups,
	useProfileActivity,
} from './-activity-monitor-data';
import { activityReach, useActivitySelection } from './-activity-view';

/**
 * One Profile's field work over a date range, on one map.
 *
 * Five explorers already filter by personnel, so "what did this person do
 * today, and where" is answerable — by opening five surfaces, setting the same
 * two filters on each, and unioning the maps by eye. Two things make that union
 * wrong rather than merely tedious: the collections surface carries no personnel
 * filter at all, and no explorer filter reaches `additional_personnel`, so
 * somebody who spent a week assisting appears under their own name on nothing.
 *
 * Both gaps are read by one server endpoint here.
 */

interface ActivityFilters {
	readonly profile: string;
	readonly from: string;
	readonly to: string;
}

const ACTIVITY_FILTER_CODECS: FilterCodecs<ActivityFilters> = {
	profile: textParam,
	from: dateParam,
	to: dateParam,
};

// Neither the person picker nor the date window narrows this page down, so
// neither counts the way an explorer's filters do.
const ACTIVITY_FILTER_COUNTING = { uncounted: ['profile', 'from', 'to'] } as const;

export const Route = createFileRoute('/activity-monitor')({
	component: ActivityMonitorRoute,
	validateSearch: searchValidator(ACTIVITY_FILTER_CODECS),
});

function ActivityMonitorRoute() {
	const filters = useActivityFilters();
	const personnel = usePersonnelOptions();
	const lookups = useActivityLookups();

	const activity = useProfileActivity(filters.window);
	// Switching person needs no explicit reset: the selection resolves by key
	// against the entries on screen, so a key the new log does not contain is
	// already no selection.
	const selection = useActivitySelection(activity.data?.items);
	const { view } = selection;
	const counts = useMemo(() => countActivityByFamily(view.items), [view.items]);
	const reach = activityReach(activity.data, view.items.length);
	const panelState = activityPanelState(
		{
			hasProfile: filters.window.profileId !== null,
			isLoading: activity.isLoading,
			error: activity.error,
			isEmpty: view.days.length === 0,
		},
		ACTIVITY_RANGE_COPY,
	);

	// The person picker and the date window are this page, not a way of cutting
	// it down, so the card they live in opens with it.
	const panel = useExplorerPanel({ filtersOpen: true });

	return (
		<ExplorerMapPage
			activeFilterCount={filters.activeCount}
			filters={
				<>
					<ProfilePicker
						onChange={filters.setProfile}
						options={personnel.options}
						value={filters.window.profileId}
					/>
					<DateRangeFilter {...filters.dateRange} />
					<FamilyCounts counts={counts} />
				</>
			}
			heading={{
				title: 'Activity Monitor',
				total: view.items.length,
				isLoading: activity.isLoading,
				noun: { one: 'entry', many: 'entries' },
			}}
			map={
				<>
					<MapCanvas
						activityLayer={selection.activityLayer}
						controls={{ measure: true, readout: true }}
						fitToData={view.bounds}
						inset={panel.inset}
						onMapReady={selection.onMapReady}
						searchWidth={panel.width}
					/>
					<ActivityFocusCard entry={view.selected} inset={panel.inset} onClose={selection.clear} />
				</>
			}
			panel={panel}
			results={{
				// A log grouped by day, not a flat list: the panel fills the rows slot
				// with its own body, including the cap notice and the messages that
				// name a reason. See {@link ExplorerResults}.
				body: (
					<ActivityLog
						copy={ACTIVITY_RANGE_COPY}
						days={view.days}
						lookups={lookups}
						message={panelState.message}
						onSelect={selection.select}
						selectedKey={selection.selectedKey}
						timeZone={filters.timeZone}
						total={reach.total}
						truncated={reach.truncated}
					/>
				),
				isEmpty: panelState.isEmpty,
				emptyTitle: panelState.emptyTitle,
				emptyDescription: panelState.emptyDescription,
				// A log line is one dot and one line of text, not the 60px record card
				// the rail sizes its placeholders to by default.
				skeletonClassName: 'h-8',
			}}
		/>
	);
}

/**
 * The page's filters, held in the URL: which person, and which dates.
 *
 * Defaults to the signed-in person and today, so the page is useful to a
 * collector reviewing their own day without configuring anything — and because
 * the filters are in the address, one particular person's one particular day is
 * a link somebody can be sent.
 */
function useActivityFilters(): {
	/** Always zero here: see `ACTIVITY_FILTER_COUNTING`. */
	readonly activeCount: number;
	readonly window: {
		readonly profileId: string | null;
		readonly dateFrom: string;
		readonly dateTo: string;
	};
	readonly dateRange: ReturnType<typeof useDateRangeFilters>;
	readonly setProfile: (next: string) => void;
	/** The agency's zone, which every date and time on this page is read in. */
	readonly timeZone: string | undefined;
} {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const snapshot = useAuthSnapshot();
	const ownProfileId =
		snapshot?.authenticated === true ? (snapshot.localIdentity.profileId ?? '') : '';

	const defaults = useMemo<ActivityFilters>(
		() => ({ profile: ownProfileId, from: today, to: today }),
		[ownProfileId, today],
	);
	const { filters, setFilters, activeCount } = useSearchFilters(
		defaults,
		ACTIVITY_FILTER_CODECS,
		ACTIVITY_FILTER_COUNTING,
	);
	const setProfile = useCallback((next: string) => setFilters({ profile: next }), [setFilters]);

	return {
		activeCount,
		window: {
			profileId: filters.profile === '' ? null : filters.profile,
			dateFrom: filters.from,
			dateTo: filters.to,
		},
		dateRange: useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters }),
		setProfile,
		timeZone,
	};
}

// --- filters -----------------------------------------------------------------

function ProfilePicker({
	value,
	options,
	onChange,
}: {
	readonly value: string | null;
	readonly options: readonly { readonly id: string; readonly label: string }[];
	readonly onChange: (next: string) => void;
}) {
	// Type-to-search rather than a scroll: an agency's roster runs to hundreds of
	// profiles, most of them historical, and a supervisor knows the name.
	const autocompleteOptions = useMemo(
		() => options.map((option) => ({ value: option.id, label: option.label })),
		[options],
	);

	return (
		<Autocomplete
			aria-label="Person"
			emptyValue=""
			onValueChange={(next) => onChange(next ?? '')}
			options={autocompleteOptions}
			placeholder="Search people…"
			value={value ?? ''}
		/>
	);
}

/** Per-family totals for the whole range. These are also the map's legend. */
function FamilyCounts({ counts }: { readonly counts: Readonly<Record<ActivityFamily, number>> }) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
			{ACTIVITY_FAMILY_LABELS.map(({ key, label }) => (
				<span
					className="flex items-center gap-1.5 text-muted-foreground text-xs"
					key={key}
					title={label}
				>
					<FamilyDot family={key} />
					<span>{label}</span>
					<span className="font-medium text-foreground tabular-nums">{counts[key]}</span>
				</span>
			))}
		</div>
	);
}

function FamilyDot({ family }: { readonly family: ActivityFamily }) {
	return (
		<span
			aria-hidden="true"
			className="size-2.5 shrink-0 rounded-full"
			style={{ backgroundColor: mapFamily[family] }}
		/>
	);
}
