/**
 * The Dashboard: the state of the Organization, for the person deciding what
 * happens next. Three sections: the last-7-days strip, the two backlog panels,
 * and the people in the field today. The strip, the people table and four
 * queues read Electric through `hooks/`; the three server queues are one
 * round-trip in `dashboard-data.ts`, up to five minutes stale. Each panel
 * answers for its own loading and error states. `docs/dashboard-spec.md` is
 * the brief.
 */

import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useDashboard } from '../../hooks/dashboard/use-dashboard';
import { useOrganizationClock } from '../../hooks/use-organization-clock';
import { ActivityStrip } from './activity-strip';
import { OperationsBacklog, SurveillanceBacklog } from './dashboard-queues';
import { PeopleTodayPanel } from './people-today-panel';

const HomeIcon = iconRegistry.generic.home.icon;

export function DashboardPage() {
	const today = useOrganizationClock().today();
	const server = useDashboard();

	return (
		<div
			className={cn(
				pageContainer({ gap: 'overview', measure: 'record', padding: 'page' }),
				'@container',
			)}
		>
			<PageHeader icon={HomeIcon} title="Dashboard" />
			<ActivityStrip today={today} />
			<div className="grid gap-5 @5xl:grid-cols-2">
				<SurveillanceBacklog server={server} today={today} />
				<OperationsBacklog server={server} today={today} />
			</div>
			<PeopleTodayPanel today={today} />
		</div>
	);
}

// --- pending queues ----------------------------------------------------------
