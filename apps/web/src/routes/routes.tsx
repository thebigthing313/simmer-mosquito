import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/routes')({
	component: () => (
		<StubPage
			kicker="GIS data"
			title="Routes"
			body="Mock route library for recurring field paths, stop ordering, coverage, and crew-ready plans."
			items={[
				{
					label: 'North basin larval loop',
					detail: '12 stops, 18.4 miles, Crew 2 default',
					status: 'Ready',
					tone: 'success',
				},
				{
					label: 'River Road adult collection',
					detail: '6 traps, evening pickup window',
					status: 'Scheduled',
					tone: 'info',
				},
				{
					label: 'West canal follow-up',
					detail: 'Source reduction access route',
					status: 'Draft',
					tone: 'attention',
				},
			]}
		/>
	),
});
