import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/regions')({
	component: () => (
		<StubPage
			kicker="GIS data"
			title="Regions"
			body="Mock region management for treatment areas, surveillance zones, boundaries, and responsibility areas."
			items={[
				{ label: 'North Basin', detail: 'Larval inspection and adult collection cluster', status: 'Active', tone: 'info' },
				{ label: 'Oak Ridge', detail: 'Catch basin treatment region', status: 'Active', tone: 'success' },
				{ label: 'Cedar Industrial Park', detail: 'Threshold review after positive habitat', status: 'Watch', tone: 'attention' },
			]}
		/>
	),
});
