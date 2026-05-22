import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/requests-for-control')({
	component: () => (
		<StubPage
			kicker="Operations"
			title="Requests for control"
			body="Mock request queue for converting surveillance findings and service requests into control work."
			items={[
				{
					label: 'Cedar retention pond treatment',
					detail: 'From HT-884 positive larval sample',
					status: 'Needs approval',
					tone: 'attention',
				},
				{
					label: 'Maple Court source reduction',
					detail: 'From SR-1048 standing water complaint',
					status: 'Draft',
					tone: 'info',
				},
				{
					label: 'Mill Creek ULV review',
					detail: 'Post-action nuisance check complete',
					status: 'Closed',
					tone: 'success',
				},
			]}
		/>
	),
});
