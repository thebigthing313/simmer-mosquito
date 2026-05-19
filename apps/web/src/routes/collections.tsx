import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/collections')({
	component: () => (
		<StubPage
			kicker="Adult surveillance"
			title="Collections"
			body="Mock adult collection records for trap nights, counts, pools, and delivery status."
			items={[
				{ label: 'AC-771 River Road', detail: '18.6 trap-night rate, north basin cluster', status: 'Above threshold', tone: 'attention' },
				{ label: 'AC-764 Park Yard', detail: 'Specimens received by lab', status: 'Processing', tone: 'info' },
				{ label: 'AC-752 Mill Creek', detail: 'Low count after control action', status: 'Stable', tone: 'success' },
			]}
		/>
	),
});
