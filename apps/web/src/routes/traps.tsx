import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/traps')({
	component: () => (
		<StubPage
			kicker="Adult surveillance"
			title="Traps"
			body="Mock trap inventory for EVS, gravid, and sentinel locations with service status."
			items={[
				{ label: 'TR-318 River Road EVS', detail: 'Collection due today at 2:00 PM', status: 'Ready', tone: 'success' },
				{ label: 'TR-204 Park Yard gravid trap', detail: 'Battery swap requested', status: 'Needs service', tone: 'attention' },
				{ label: 'TR-119 North basin sentinel', detail: 'Last collection completed May 17', status: 'Current', tone: 'info' },
			]}
		/>
	),
});
