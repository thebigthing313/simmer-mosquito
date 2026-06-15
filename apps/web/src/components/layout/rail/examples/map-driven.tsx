import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { todayWork } from '../../shared/demo-data';
import { MapPlaceholder } from '../../shared/map-placeholder';
import { WorkRow } from '../../shared/primitives';
import { RailShell } from '../outlet-shell';

/** Map-driven layout: full-bleed map with a floating, scrollable work panel. */
export function RailMapExample() {
	return (
		<RailShell
			activePath="/habitats"
			fullBleed
			page={{
				context: 'Larval Surveillance',
				title: 'Habitats',
				actions: (
					<Button type="button" size="sm">
						New habitat
					</Button>
				),
			}}
		>
			<div className="relative h-full">
				<MapPlaceholder
					className="h-full"
					caption="Habitat overlay"
					captionDetail="Active, inactive, and inaccessible habitats"
				/>
				<div className="absolute top-4 left-4 flex max-h-[calc(100%-2rem)] w-[340px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-lg border border-border/40 bg-card/90 shadow-[0_18px_40px_-24px_oklch(36%_0.024_205/60%)] backdrop-blur-sm">
					<div className="flex items-center justify-between gap-2 border-b border-border/35 px-3 py-2.5">
						<strong className="text-[0.92rem]">Today’s work</strong>
						<span className="text-[0.78rem] font-bold text-muted-foreground">
							{todayWork.length} items
						</span>
					</div>
					<ScrollArea className="min-h-0 flex-auto">
						<div className="grid gap-2 p-3">
							{todayWork.map((item) => (
								<WorkRow item={item} key={item.id} />
							))}
						</div>
					</ScrollArea>
				</div>
			</div>
		</RailShell>
	);
}
