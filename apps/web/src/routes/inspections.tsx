import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/inspections')({
	component: () => (
		<StubPage
			kicker="Larval surveillance"
			title="Inspections"
			body="Mock larval inspection queue for field visits, results, and follow-up timing."
			items={[
				{
					label: 'North basin route',
					detail: '12 stops assigned to Crew 2',
					status: 'Assigned',
					tone: 'info',
				},
				{
					label: 'Cedar Industrial Park',
					detail: 'Follow-up required after positive sample',
					status: 'High priority',
					tone: 'danger',
				},
				{
					label: 'Oak Ridge basins',
					detail: 'Routine seven-day inspection window',
					status: 'Scheduled',
					tone: 'success',
				},
			]}
		/>
	),
});
