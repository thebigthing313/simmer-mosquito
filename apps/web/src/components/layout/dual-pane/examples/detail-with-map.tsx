import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { requests } from '../../shared/demo-data';
import { MapPlaceholder } from '../../shared/map-placeholder';
import {
	Fact,
	mutedBodyClass,
	rowTitleClass,
	SectionHeader,
	StatusBadge,
	Surface,
	TimelineItem,
} from '../../shared/primitives';
import { DualPaneShell } from '../outlet-shell';

/** Detail layout: master list in the context pane, record + small map in the main pane. */
export function DualPaneDetailExample() {
	const selected = requests[0];
	if (selected === undefined) {
		return null;
	}

	return (
		<DualPaneShell
			activePath="/service-requests"
			page={{
				context: 'Public Engagement',
				title: 'Service requests',
				tabs: [{ label: 'Overview' }, { label: 'History' }, { label: 'Map' }],
			}}
			aside={
				<div className="grid content-start gap-1.5 p-2">
					{requests.map((request) => {
						const active = request.id === selected.id;
						return (
							<button
								type="button"
								key={request.id}
								className={cn(
									'grid gap-1 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors',
									active ? 'border-border/45 bg-(--app-selection)' : 'hover:bg-muted/50',
								)}
							>
								<div className="flex items-center justify-between gap-2">
									<strong className="truncate text-[0.9rem]">{request.title}</strong>
									<StatusBadge tone={request.tone}>{request.status}</StatusBadge>
								</div>
								<p className={mutedBodyClass}>
									{request.id} · {request.address}
								</p>
							</button>
						);
					})}
				</div>
			}
		>
			<div className="grid content-start gap-5">
				<div>
					<p className="eyebrow">{selected.id}</p>
					<h2 className={cn(rowTitleClass, 'text-[1.3rem] font-extrabold')}>{selected.title}</h2>
					<p className={mutedBodyClass}>
						{selected.address} · received {selected.received}
					</p>
				</div>
				<div className="overflow-hidden rounded-lg border border-border/35">
					<MapPlaceholder
						size="inset"
						caption="Request context"
						captionDetail="2 habitats, 1 trap nearby"
					/>
				</div>
				<div className="grid grid-cols-4 gap-2.5 max-[820px]:grid-cols-2">
					<Fact label="Status" value={selected.status} />
					<Fact label="Intake" value={selected.source} />
					<Fact label="Priority" value={selected.priority} />
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
					</div>
				</Surface>
			</div>
		</DualPaneShell>
	);
}
