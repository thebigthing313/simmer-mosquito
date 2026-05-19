import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/chemical-control')({
	component: () => (
		<StubPage
			kicker="Control actions"
			title="Chemical control"
			body="Mock chemical control queue for larvicide, adulticide, products, rates, and application records."
			items={[
				{ label: 'North basin larvicide', detail: 'Catch basin treatment planned for 44 structures', status: 'Planned', tone: 'info' },
				{ label: 'Cedar pond treatment', detail: 'Product selection pending after positive sample', status: 'Needs review', tone: 'attention' },
				{ label: 'Mill Creek ULV', detail: 'Completed after evening nuisance reports', status: 'Complete', tone: 'success' },
			]}
		/>
	),
});
