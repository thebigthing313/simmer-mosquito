import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/assignments')({
	component: () => (
		<StubPage
			kicker="Operations"
			title="Assignments"
			body="Mock assignment board for crews, individual work, equipment, and field-ready dispatch."
			items={[
				{
					label: 'Crew 2 north basin route',
					detail: 'Larval inspections, starts 9:00 AM',
					status: 'Assigned',
					tone: 'info',
				},
				{
					label: 'Public Requests triage',
					detail: '5 open requests need first review',
					status: 'Needs triage',
					tone: 'attention',
				},
				{
					label: 'EVS trap collection',
					detail: 'TR-318 River Road pickup at 2:00 PM',
					status: 'Ready',
					tone: 'success',
				},
			]}
		/>
	),
});
