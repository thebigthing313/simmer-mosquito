import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/source-reductions')({
	component: () => (
		<StubPage
			kicker="Control actions"
			title="Source reductions"
			body="Mock source reduction work for removal, drainage, habitat modification, and resident follow-up."
			items={[
				{
					label: 'West canal debris removal',
					detail: 'Blocked flow reported by field staff',
					status: 'Requested',
					tone: 'attention',
				},
				{
					label: 'Maple Court container cleanup',
					detail: 'Resident outreach paired with inspection',
					status: 'Assigned',
					tone: 'info',
				},
				{
					label: 'Oak Ridge tire pickup',
					detail: 'Removed 12 tire habitats',
					status: 'Complete',
					tone: 'success',
				},
			]}
		/>
	),
});
