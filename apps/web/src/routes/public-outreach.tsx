import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/public-outreach')({
	component: () => (
		<StubPage
			kicker="Control actions"
			title="Public outreach"
			body="Mock outreach log for door hangers, education events, notices, and resident communication."
			items={[
				{
					label: 'Maple Court door hanger',
					detail: 'Container prevention guidance paired with SR-1048',
					status: 'Planned',
					tone: 'info',
				},
				{
					label: 'North basin advisory',
					detail: 'Rain-driven standing water notice drafted',
					status: 'Needs approval',
					tone: 'attention',
				},
				{
					label: 'School science night',
					detail: 'Education booth completed',
					status: 'Complete',
					tone: 'success',
				},
			]}
		/>
	),
});
