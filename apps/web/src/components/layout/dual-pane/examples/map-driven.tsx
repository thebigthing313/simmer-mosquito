import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { todayWork } from '../../shared/demo-data';
import { MapPlaceholder } from '../../shared/map-placeholder';
import { WorkRow } from '../../shared/primitives';
import { DualPaneShell } from '../outlet-shell';

/** Map-driven layout: the context pane holds the work list, the main pane is the map. */
export function DualPaneMapExample() {
	return (
		<DualPaneShell
			activePath="/today"
			fullBleed
			page={{
				context: 'General',
				title: "Today's activities",
				tabs: [{ label: 'Map' }, { label: 'List' }, { label: 'Timeline' }],
				actions: (
					<Button type="button" size="sm">
						Dispatch
					</Button>
				),
			}}
			aside={
				<div className="grid content-start gap-2.5 p-3">
					<div className="flex items-center justify-between px-1">
						<strong className="text-[0.92rem]">Scheduled work</strong>
						<span className="text-[0.78rem] font-bold text-muted-foreground">
							{todayWork.length} items
						</span>
					</div>
					{todayWork.map((item) => (
						<WorkRow item={item} key={item.id} />
					))}
				</div>
			}
		>
			<MapPlaceholder
				className="h-full"
				caption="Dispatch overlay"
				captionDetail="Route and status overlays"
			/>
		</DualPaneShell>
	);
}
