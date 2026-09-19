/**
 * The Dashboard: the state of the Organization, for the person deciding what
 * happens next. Four sections: the two backlog panels, the untreated habitats
 * banner, the last-7-days strip, and the people in the field today. Four
 * queues read Electric through `hooks/queries`; everything else is one server
 * round-trip in `dashboard-data.ts`, up to five minutes stale. Each panel
 * answers for its own loading and error states. `docs/dashboard-spec.md` is
 * the brief.
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
