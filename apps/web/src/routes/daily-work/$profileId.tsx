import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { ArrowLeftIcon, ContactIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ExplorerMapPage, useExplorerPanel, usePersonnelOptions } from '../../components/explorer';
import { MapCanvas } from '../../components/map';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { formatLocalDate, parseLocalDate, todayInTimeZone } from '../../lib/local-date';
import {
	dateParam,
	type FilterCodecs,
	searchValidator,
	useSearchFilters,
} from '../../lib/search-filters';
import { ActivityFocusCard, ActivityLog } from '../-activity-log';
import {
	activityPanelState,
	useActivityLookups,
	useProfileActivity,
} from '../-activity-monitor-data';
import { activityReach, useActivitySelection } from '../-activity-view';
import { DAILY_WORK_COPY, dailyWorkDay, dailyWorkWindow, isProfileId } from './-daily-work';
import { dailyWorkLegend } from './-legend';

/**
 * One Profile's field work for one day, on one map.
 *
 * The Activity Monitor asks the same endpoint over a window, with the person in
 * a picker beside the dates. That made a supervisor set two controls to reach
 * the question they were already holding: what did this person do today. Here
 * the person is the address, so the page is a link, and the only control left is
 * which day.
 *
 * One day rather than a range is also what makes the map readable. A week of
 * work is a cloud with no order in it, because six of the nine record kinds
 * carry no time of day; a day is a round somebody drove.
 */

interface DailyWorkFilters {
	readonly date: string;
}

const DAILY_WORK_FILTER_CODECS: FilterCodecs<DailyWorkFilters> = { date: dateParam };

// The day is this page rather than a way of cutting it down, so it carries no
// filter count the way an explorer's filters do.
const DAILY_WORK_FILTER_COUNTING = { uncounted: ['date'] } as const;

export const Route = createFileRoute('/daily-work/$profileId')({
	component: DailyWorkRoute,
	validateSearch: searchValidator(DAILY_WORK_FILTER_CODECS),
});

/**
 * Whose day this is, before anything is read for them.
 *
 * Profiles sync eagerly, so the roster is already on the client and the id in
 * the path can be answered here rather than by a request that comes back empty.
 * That distinction is the point: an unknown id showing a blank day reads as a
 * colleague who did nothing, which is a conclusion about a person.
 */
function DailyWorkRoute() {
	const { profileId } = Route.useParams();
	const personnel = usePersonnelOptions();
	const name = isProfileId(profileId) ? personnel.nameById.get(profileId) : undefined;

	return name === undefined ? (
		<ProfileNotFound />
	) : (
		<DailyWorkPage name={name} profileId={profileId} />
	);
}

function DailyWorkPage({ profileId, name }: { readonly profileId: string; readonly name: string }) {
	const timeZone = useOrganizationTimeZone();
	// The organization's today, not the browser's. A supervisor two zones away
	// opens the same day the collector on the road is filling in.
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const { day, setDay, activeCount } = useDailyWorkDay(today);
	const lookups = useActivityLookups();

	const activity = useProfileActivity(dailyWorkWindow(profileId, day));
	// Changing the day needs no explicit reset: the selection resolves by key
	// against the entries on screen, so a key the new day does not contain is
	// already no selection.
	const selection = useActivitySelection(activity.data?.items);
	const { view } = selection;
	const reach = activityReach(activity.data, view.items.length);
	const panelState = activityPanelState(
		{
			hasProfile: true,
			isLoading: activity.isLoading,
			error: activity.error,
			isEmpty: view.days.length === 0,
		},
		DAILY_WORK_COPY,
	);
	const legend = useMemo(() => dailyWorkLegend(view.items), [view.items]);

	// The day is this page, not a way of narrowing it, so the card it lives in
	// opens with the page.
	const panel = useExplorerPanel({ filtersOpen: true });

	return (
		<ExplorerMapPage
			activeFilterCount={activeCount}
			filters={<DayFilter onChange={setDay} today={today} value={day} />}
			heading={{
				title: name,
				icon: iconRegistry.simmer.fieldWork.icon,
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
						legend={legend}
						onMapReady={selection.onMapReady}
						searchWidth={panel.width}
					/>
					<ActivityFocusCard entry={view.selected} inset={panel.inset} onClose={selection.clear} />
				</>
			}
			panel={panel}
			results={{
				// A log grouped by family, not a flat list: the panel fills the rows slot
				// with its own body, including the messages that name a reason.
				body: (
					<ActivityLog
						copy={DAILY_WORK_COPY}
						days={view.days}
						lookups={lookups}
						message={panelState.message}
						onSelect={selection.select}
						selectedKey={selection.selectedKey}
						timeZone={timeZone}
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
 * The day, held in the URL so one person's one day is a link.
 *
 * Clearing the picker lands on today rather than on no day at all: the page has
 * to be showing something, and today is what it opens on.
 */
function useDailyWorkDay(today: string): {
	readonly day: string;
	readonly setDay: (next: string) => void;
	/** Always zero here: see `DAILY_WORK_FILTER_COUNTING`. */
	readonly activeCount: number;
} {
	const defaults = useMemo<DailyWorkFilters>(() => ({ date: today }), [today]);
	const { filters, setFilters, activeCount } = useSearchFilters(
		defaults,
		DAILY_WORK_FILTER_CODECS,
		DAILY_WORK_FILTER_COUNTING,
	);
	const day = dailyWorkDay(filters.date, today);

	// A stale or hand-typed future day is drawn as today, so the address has to
	// say today as well. Left alone, the link is one that names a day it does not
	// show, and it stays wrong every time it is opened or copied.
	useEffect(() => {
		if (filters.date !== day) {
			setFilters({ date: day });
		}
	}, [filters.date, day, setFilters]);

	return {
		activeCount,
		day,
		setDay: useCallback(
			(next: string) => setFilters({ date: next === '' ? today : next }),
			[setFilters, today],
		),
	};
}

/** The one control the page has. `today` bounds it, so no future day is reachable. */
function DayFilter({
	value,
	today,
	onChange,
}: {
	readonly value: string;
	readonly today: string;
	readonly onChange: (next: string) => void;
}) {
	return (
		<div className="flex items-center gap-3">
			<span className="w-14 shrink-0 font-medium text-muted-foreground text-xs">Day</span>
			<DatePicker
				ariaLabel="Day"
				className="h-8 flex-1 text-xs"
				max={parseLocalDate(today)}
				onChange={(date) => onChange(date === undefined ? '' : formatLocalDate(date))}
				placeholder="Pick a day"
				value={parseLocalDate(value)}
			/>
		</div>
	);
}

/** The path names nobody this organization has. Said, rather than drawn as a quiet day. */
function ProfileNotFound() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<ContactIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Person not found</EmptyTitle>
					<EmptyDescription>
						This link names nobody in this organization. The Profile may have been removed, or the
						link may be out of date.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button asChild variant="outline">
						<Link to="/my-organization/people">
							<ArrowLeftIcon aria-hidden="true" />
							Back to people
						</Link>
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	);
}
