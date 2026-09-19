/**
 * The Dashboard: the state of the Organization, for the person deciding what
 * happens next.
 *
 * Four sections, top to bottom: the two backlog panels, the untreated habitats
 * banner, the last-7-days strip, and the people in the field today. Nothing
 * here is a list of records except the people table; a queue shows a count
 * and the age of the oldest and links to the explorer that lists them, with
 * the explorer's filters set so it shows the rows the count counted.
 *
 * Every number has one of two sources. Four queues read Electric through the
 * hooks under `hooks/queries`, so the row moves the instant a Collector saves.
 * Everything else is one server round-trip in `-dashboard-data.ts`, up to five
 * minutes stale, and nothing on the page says which is which. Each panel
 * answers for its own loading and error states, the way the overviews do.
 * `docs/dashboard-spec.md` is the brief; the names on screen are the ones the
 * prototype settled, except that every record noun reads `recordNoun`.
 */

import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useDashboard } from '../../hooks/dashboard/use-dashboard';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../lib/local-date';
import { ActivityStrip } from './activity-strip';
import { OperationsBacklog, SurveillanceBacklog } from './dashboard-queues';
import { PeopleTodayPanel } from './people-today-panel';
import { UntreatedBanner } from './untreated-banner';

const HomeIcon = iconRegistry.generic.home.icon;

export function DashboardPage() {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const server = useDashboard();

	return (
		<div className={pageContainer({ gap: 'overview', measure: 'record', padding: 'page' })}>
			<PageHeader
				description="The state of the Organization, for the person deciding what happens next."
				eyebrow="Organization"
				icon={HomeIcon}
				title="Dashboard"
			/>
			<div className="grid gap-5 xl:grid-cols-2">
				<SurveillanceBacklog server={server} timeZone={timeZone} today={today} />
				<OperationsBacklog server={server} timeZone={timeZone} today={today} />
			</div>
			<UntreatedBanner server={server} today={today} />
			<ActivityStrip server={server} />
			<PeopleTodayPanel server={server} timeZone={timeZone} today={today} />
		</div>
	);
}

// --- pending queues ----------------------------------------------------------
