import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { requests } from '../../shared/demo-data';
import { MapPlaceholder } from '../../shared/map-placeholder';
import { Fact, SectionHeader, Surface, TimelineItem } from '../../shared/primitives';
import { ClassicShell } from '../outlet-shell';

/** Detail layout: record facts and history beside a small inset map. */
export function ClassicDetailExample() {
	const request = requests[0];
	if (request === undefined) {
		return null;
	}

	return (
		<ClassicShell
			activePath="/service-requests"
			page={{
				context: 'Public Engagement',
				title: request.title,
				summary: `${request.id} at ${request.address}. Location, nearby records, and history are the job here.`,
				actions: <Button type="button">Create assignment</Button>,
			}}
		>
			<div className="mx-auto grid w-full max-w-[1380px] grid-cols-[minmax(0,1fr)_minmax(320px,0.5fr)] items-start gap-5 max-[1120px]:grid-cols-1">
				<section className="grid min-w-0 content-start gap-5">
					<div className="grid grid-cols-4 gap-2.5 max-[820px]:grid-cols-2">
						<Fact label="Status" value={request.status} />
						<Fact label="Intake" value={request.source} />
						<Fact label="Priority" value={request.priority} />
						<Fact label="Nearby" value="2 habitats, 1 trap" />
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
				</section>
				<aside className="overflow-hidden rounded-lg border border-border/35 bg-card/92">
					<div className="px-4 py-3 shadow-[inset_0_-1px_color-mix(in_oklch,var(--border)_32%,transparent)]">
						<p className="eyebrow">Request context</p>
						<strong>Precise operational overlays</strong>
					</div>
					<MapPlaceholder
						size="inset"
						legend={false}
						caption="Selected context"
						captionDetail="2 habitats, 1 trap, 1 recent action"
					/>
				</aside>
			</div>
		</ClassicShell>
	);
}
