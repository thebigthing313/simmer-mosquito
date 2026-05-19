import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/group-settings')({
	component: () => (
		<StubPage
			kicker="General"
			title="Group settings"
			body="Mock setup space for crews, permissions, equipment defaults, and operational lookup health."
			items={[
				{ label: 'North Basin Crew', detail: '4 members, inspection kit, truck assigned', status: 'Available', tone: 'success' },
				{ label: 'Evening ULV', detail: '2 members, vehicle calibration due tomorrow', status: 'Scheduled', tone: 'info' },
				{ label: 'Public Requests', detail: '3 members handling service request triage', status: 'Busy', tone: 'attention' },
			]}
		/>
	),
});
