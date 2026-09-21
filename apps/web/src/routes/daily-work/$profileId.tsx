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
import {
	ArrowLeftIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ContactIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { activityPanelState } from '../../components/activity/activity-data';
import { ActivityFocusCard } from '../../components/activity/activity-focus-card';
import { ActivityLog } from '../../components/activity/activity-log';
import {
	DAILY_WORK_COPY,
	DAILY_WORK_FILTER_CODECS,
	dailyWorkStep,
	isProfileId,
} from '../../components/daily-work/daily-work';
import { dailyWorkLegend } from '../../components/daily-work/legend';
import { ExplorerMapPage } from '../../components/explorer';
import { MapCanvas } from '../../components/map';
import { useActivityLookups } from '../../hooks/activity/use-activity-lookups';
import { useActivitySelection } from '../../hooks/activity/use-activity-selection';
import { useDayActivity } from '../../hooks/activity/use-day-activity';
import { useDailyWorkDay } from '../../hooks/daily-work/use-daily-work-day';
import { useExplorerPanel } from '../../hooks/explorer/use-explorer-panel';
import { usePersonnelOptions } from '../../hooks/explorer/use-personnel-options';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { formatLocalDate, parseLocalDate, todayInTimeZone } from '../../lib/local-date';
import { searchValidator } from '../../lib/search-filters';

/**
 * One Profile's field work for one day, on one map.
 *
 * The person is the address rather than a picker, so the page is a link
 * somebody can be sent, and the only control on it is which day. That is what
 * the surface this replaced made a supervisor set two controls to reach: what
 * did this person do today.
 *
 * One day rather than a range is also what makes the map readable. A week of
 * work is a cloud with no order in it, because six of the nine record kinds
 * carry no time of day; a day is a round somebody drove.
 */

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
	const today = todayInTimeZone(timeZone);
	const { day, setDay } = useDailyWorkDay(today);
	const lookups = useActivityLookups();

	// The whole Organization's day, filtered to this person: the same subsets
	// the Dashboard's people table opens, so stepping between people costs
	// nothing and a record moves here the moment it syncs.
	const activity = useDayActivity(day, timeZone);
	const items = activity.entries.filter((entry) => entry.profileId === profileId);
	// Changing the day needs no explicit reset: the selection resolves by key
	// against the entries on screen, so a key the new day does not contain is
	// already no selection.
	const selection = useActivitySelection(items);
	const { view } = selection;
	const panelState = activityPanelState(
		{
			isLoading: !activity.isReady,
			isError: activity.isError,
			isEmpty: view.families.length === 0,
		},
		DAILY_WORK_COPY,
	);
	const legend = dailyWorkLegend(view.items);

	const panel = useExplorerPanel();

	return (
		<ExplorerMapPage
			heading={{
				title: name,
				icon: iconRegistry.simmer.fieldWork.icon,
				total: view.items.length,
				isLoading: !activity.isReady,
				counts: { one: 'entry', many: 'entries' },
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
						families={view.families}
						lookups={lookups}
						message={panelState.message}
						onSelect={selection.select}
						selectedKey={selection.selectedKey}
						timeZone={timeZone}
					/>
				),
				isEmpty: panelState.isEmpty,
				emptyTitle: panelState.emptyTitle,
				emptyDescription: panelState.emptyDescription,
				// A log line is one dot and one line of text, not the 60px record card
				// the rail sizes its placeholders to by default.
				skeletonClassName: 'h-8',
			}}
			toolbar={<DayStepper onChange={setDay} today={today} value={day} />}
		/>
	);
}

/**
 * The one control the page has: the day, with the day either side of it.
 *
 * It sits in the panel header rather than in a filter card, which is what it
 * used to be. A card is a thing a reader opens to narrow a list and shuts
 * again, and it cost this page a second 380px column of map to hold one
 * control the page cannot be read without. The arrows are what the card never
 * had: reading a person's week is six visits to a calendar popover, and this
 * makes it six clicks in one place.
 *
 * `today` bounds it, so no future day is reachable by either the picker or the
 * forward arrow.
 */
function DayStepper({
	value,
	today,
	onChange,
}: {
	readonly value: string;
	readonly today: string;
	readonly onChange: (next: string) => void;
}) {
	// Disabled rather than hidden, so the pair keeps its width and the picker
	// between them does not shift sideways on the day a reader steps to today.
	const isToday = value >= today;
	return (
		<div className="flex items-center gap-1">
			<Button
				aria-label="Previous day"
				onClick={() => onChange(dailyWorkStep(value, -1, today))}
				size="icon-sm"
				title="Previous day"
				variant="ghost"
			>
				<ChevronLeftIcon aria-hidden="true" />
			</Button>
			<DatePicker
				ariaLabel="Day"
				className="h-8 flex-1 text-xs"
				// The weekday and the month written out. That is how a supervisor
				// reads a round: a Tuesday's larval route and a Saturday's service
				// requests are different days of work, and the date alone does not
				// say which. The control is the whole width of the panel header
				// here, so there is room for the words.
				displayFormat="EEEE, MMMM d, yyyy"
				max={parseLocalDate(today)}
				onChange={(date) => onChange(date === undefined ? '' : formatLocalDate(date))}
				placeholder="Pick a day"
				value={parseLocalDate(value)}
			/>
			<Button
				aria-label="Next day"
				disabled={isToday}
				onClick={() => onChange(dailyWorkStep(value, 1, today))}
				size="icon-sm"
				title="Next day"
				variant="ghost"
			>
				<ChevronRightIcon aria-hidden="true" />
			</Button>
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
