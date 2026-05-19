import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { createFileRoute, Link } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/missions')({
	component: () => (
		<div className="grid gap-3.5">
			<StubPage
				kicker="Operations"
				title="Missions"
				body="Mock mission list for dispatching sequenced work, route stops, resources, and review status."
				items={[
					{
						label: 'MI-221 North basin larval inspection',
						detail: '3 priority stops, Crew 2 assigned',
						status: 'Scheduled',
						tone: 'info',
					},
					{
						label: 'MI-214 River Road collection',
						detail: 'EVS trap pickup and delivery',
						status: 'Ready',
						tone: 'success',
					},
					{
						label: 'MI-208 Cedar follow-up',
						detail: 'Control decision pending threshold review',
						status: 'Needs review',
						tone: 'attention',
					},
				]}
			/>
			<div className="flex justify-start">
				<Button asChild variant="outline">
					<Link to="/missions/edit">Open mission editor prototype</Link>
				</Button>
			</div>
		</div>
	),
});
