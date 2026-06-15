import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { todayWork } from '../../shared/demo-data';
import { MapPlaceholder } from '../../shared/map-placeholder';
import { WorkRow } from '../../shared/primitives';
import { ClassicShell } from '../outlet-shell';

/** Map-driven layout: scrollable work list beside a full-height map. */
export function ClassicMapExample() {
	return (
		<ClassicShell
			activePath="/today"
			fullBleed
			page={{
				context: 'General',
				title: "Today's activities",
				summary: 'Where is today’s work, what is next, and what needs intervention?',
			}}
		>
			<div className="grid h-full min-h-0 grid-cols-[minmax(360px,0.46fr)_minmax(0,1fr)] gap-5 max-[1120px]:grid-cols-1 max-[1120px]:overflow-auto">
				<section className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
					<div className="flex flex-wrap gap-2 rounded-lg border border-border/35 bg-card/78 px-3 py-3">
						<Button type="button" variant="secondary" size="sm">
							All
						</Button>
						<Button type="button" variant="ghost" size="sm">
							Requests
						</Button>
						<Button type="button" variant="ghost" size="sm">
							Missions
						</Button>
						<Button type="button" variant="ghost" size="sm">
							Controls
						</Button>
					</div>
					<div className="grid gap-2.5">
						{todayWork.map((item) => (
							<WorkRow item={item} key={item.id} />
						))}
					</div>
				</section>
				<section className="min-h-0 overflow-hidden rounded-lg border border-border/35">
					<MapPlaceholder
						caption="Dispatch overlay"
						captionDetail="Route and status overlays only"
						className="h-full"
					/>
				</section>
			</div>
		</ClassicShell>
	);
}
