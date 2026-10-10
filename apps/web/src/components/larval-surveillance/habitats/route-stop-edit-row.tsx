import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { ChevronRightIcon, HomeIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Tag } from '../../../hooks/queries/tag-view';
import {
	InlineEditField,
	type MoveAction,
	OrdinalBadge,
	StopReorderControls,
} from '../../stop-order';
import { type RouteStopView, stopTone } from './route-data';
import { StopStatus, StopTagChips, StopTypePill } from './route-stop-list';

/**
 * One stop on the habitat Route edit page: its ordinal, a link to the Habitat,
 * the reorder and remove menu, the linked address, its Tags, and two inline
 * editors, the Habitat's description and the directions to the next stop.
 *
 * Takes the stop, whether the viewer may write, its place in the list, and a
 * callback per control. The description editor is not drawn while the stop's
 * Habitat is still resolving, because its save writes the Habitat and the stop
 * has no description to open it on.
 */
export function EditStopRow({
	stop,
	canSubmit,
	ordinal,
	index,
	isFirst,
	isLast,
	isSelected,
	isHighlighted,
	sameAddressAsPrev,
	typeName,
	tags,
	onEditAddress,
	onMove,
	onRemove,
	onSaveDescription,
	onSaveDirections,
	onSelect,
	onHover,
}: {
	readonly stop: RouteStopView;
	readonly canSubmit: boolean;
	readonly ordinal: number;
	readonly index: number;
	readonly isFirst: boolean;
	readonly isLast: boolean;
	readonly isSelected: boolean;
	readonly isHighlighted: boolean;
	readonly sameAddressAsPrev: boolean;
	readonly typeName: string | null;
	readonly tags: readonly Tag[];
	readonly onEditAddress: (stop: RouteStopView) => void;
	readonly onMove: (index: number, action: MoveAction) => void;
	readonly onRemove: (stop: RouteStopView) => void;
	readonly onSaveDescription: (habitatId: string, value: string) => void;
	readonly onSaveDirections: (routeItemId: string, value: string) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected || isHighlighted
					? 'border-primary/40 ring-1 ring-primary/25'
					: 'border-border/60',
			)}
			onMouseEnter={() => onHover(stop.routeItemId)}
			onMouseLeave={() => onHover(null)}
		>
			{/* Full-card target selects the stop on the map; interactive bits opt back in. */}
			<button
				aria-label={`Show ${stop.name} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full rounded-lg transition-colors',
					isSelected ? 'bg-primary/5' : 'hover:bg-muted/40',
				)}
				onClick={() => onSelect(isSelected ? null : stop.routeItemId)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-start gap-3 p-3">
				<OrdinalBadge ordinal={ordinal} tone={stopTone(stop)} />

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<Link
							className={cn(
								recordLink({ size: 'sm' }),
								'pointer-events-auto w-fit max-w-full truncate',
							)}
							params={{ id: stop.habitatId }}
							to="/larval-surveillance/habitats/$id"
						>
							{stop.name}
						</Link>
						<StopTypePill typeName={typeName} />
						<StopStatus stop={stop} />
						<span aria-hidden="true" className="min-w-0 flex-1" />
						{canSubmit ? (
							<StopReorderControls
								extraActions={
									<>
										<DropdownMenuItem onClick={() => onEditAddress(stop)}>
											<HomeIcon aria-hidden="true" />
											Edit linked address…
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={() => onRemove(stop)} variant="destructive">
											Remove from route
										</DropdownMenuItem>
									</>
								}
								index={index}
								isFirst={isFirst}
								isLast={isLast}
								onMove={onMove}
							/>
						) : null}
					</div>

					{/*
					 * The home icon is the label. A new address is set in medium weight
					 * and a repeat of the one above in regular: dimming the repeat with
					 * alpha put it at 2.6:1, and no lighter tier clears AA here.
					 */}
					<span
						className={cn(
							'mt-1 flex items-center gap-1.5 text-muted-foreground text-xs',
							sameAddressAsPrev ? undefined : 'font-medium',
						)}
						title={stop.addressLabel ?? undefined}
					>
						<HomeIcon aria-hidden="true" className="size-3.5 shrink-0" />
						<span className="min-w-0 truncate">{stop.addressLabel ?? <AbsentValue />}</span>
					</span>

					<StopTagChips tags={tags} />

					<div className="mt-2 grid gap-1.5">
						{stop.isResolving ? null : (
							<InlineEditField
								ariaLabel={`Description for ${stop.name}`}
								disabled={!canSubmit}
								emptyLabel="Add a description"
								onSave={(value) => onSaveDescription(stop.habitatId, value)}
								renderValue={(value) => (
									<span className="block whitespace-pre-wrap text-foreground/80 text-xs leading-snug">
										{value}
									</span>
								)}
								textareaPlaceholder="What crews should know about this habitat…"
								value={stop.description}
							/>
						)}
						<InlineEditField
							ariaLabel={`Directions after ${stop.name}`}
							disabled={!canSubmit}
							emptyLabel="Add directions to the next stop"
							onSave={(value) => onSaveDirections(stop.routeItemId, value)}
							renderValue={(value) => (
								<span className="flex items-start gap-1.5 text-muted-foreground text-xs">
									<ChevronRightIcon
										aria-hidden="true"
										className="mt-px size-3 shrink-0 rotate-90 text-muted-foreground/70"
									/>
									<span className="min-w-0 whitespace-pre-wrap">{value}</span>
								</span>
							)}
							textareaPlaceholder="e.g. Turn left at the pump station; gate code 4821."
							value={stop.directionsToNextItem ?? ''}
						/>
					</div>
				</div>
			</div>
		</li>
	);
}
