import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { requests } from '../../shared/demo-data';
import { MapPlaceholder } from '../../shared/map-placeholder';
import { Fact, SectionHeader, Surface, TimelineItem } from '../../shared/primitives';
import { RailShell } from '../outlet-shell';

/** Detail layout: a wide inset map banner above record facts and history. */
export function RailDetailExample() {
	const request = requests[0];
	if (request === undefined) {
		return null;
	}

	return (
		<RailShell
			activePath="/service-requests"
			page={{
				context: 'Service Requests',
				title: request.title,
				actions: (
					<Button type="button" size="sm">
						Create assignment
					</Button>
				),
			}}
		>
			<div className="mx-auto grid w-full max-w-[1100px] content-start gap-5">
				<section className="overflow-hidden rounded-lg border border-border/35 bg-card/92">
					<MapPlaceholder
						size="inset"
						caption="Request context"
						captionDetail="2 habitats, 1 trap nearby"
					/>
				</section>
				<div className="grid grid-cols-4 gap-2.5 max-[820px]:grid-cols-2">
					<Fact label="Status" value={request.status} />
					<Fact label="Intake" value={request.source} />
					<Fact label="Priority" value={request.priority} />
					<Fact label="Address" value={request.address} />
				</div>
				<Surface>
					<SectionHeader title="Record history" meta="Command-shaped activity" />
					<div className="grid gap-2.5">
						<TimelineItem
							title="publicEngagement.createServiceRequest"
							detail="Phone intake created with contact, location, request date, and details."
						/>
						<TimelineItem
							title="fieldWork.addComment"
							detail="Operator noted resident reports evening activity near the alley catch basin."
						/>
						<TimelineItem
							title="missionDispatch.addMissionItem"
							detail="Ready to add to tomorrow’s larval inspection mission."
						/>
					</div>
				</Surface>
			</div>
		</RailShell>
	);
}
