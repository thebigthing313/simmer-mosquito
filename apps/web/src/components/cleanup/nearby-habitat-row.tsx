import {
	convertUnitAmount,
	type ProximitySearchUnit,
	proximityLabel,
} from '@simmer-mosquito/domain';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from '@simmer-mosquito/ui-web/components/ui/item';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import type { NearbyHabitat } from '../../hooks/use-merge-candidates';
import { RECORD_CLEANUP_CONFIGS, recordLabel } from './record-cleanup-config';

const config = RECORD_CLEANUP_CONFIGS.habitat;

export function CandidateRow({
	candidate,
	isSelected,
	onToggle,
	unit,
}: {
	readonly candidate: NearbyHabitat;
	readonly isSelected: boolean;
	readonly onToggle: () => void;
	readonly unit: ProximitySearchUnit;
}) {
	const checkboxId = useId();

	return (
		<Item size="sm" variant={isSelected ? 'muted' : 'default'}>
			<ItemMedia>
				<Checkbox checked={isSelected} id={checkboxId} onCheckedChange={onToggle} />
			</ItemMedia>
			<ItemContent className="min-w-0">
				<ItemTitle>
					<Label className="cursor-pointer font-medium" htmlFor={checkboxId}>
						{recordLabel(candidate, config)}
					</Label>
					{candidate.isActive ? null : (
						<Badge className="ml-2" variant="outline">
							Retired
						</Badge>
					)}
				</ItemTitle>
				<ItemDescription className="truncate">
					{distanceLabel(candidate.distanceMetres, unit)} away
					{candidate.detail === null ? null : <> · {candidate.detail}</>}
				</ItemDescription>
			</ItemContent>
			<ItemActions>
				<Button asChild size="sm" variant="ghost">
					<Link params={{ id: candidate.id }} to="/larval-surveillance/habitats/$id">
						Open
					</Link>
				</Button>
			</ItemActions>
		</Item>
	);
}

/**
 * How far away a candidate is, in the agency's units.
 *
 * Rounded to whole units below ten and to the nearest ten above, because the
 * reader is judging "is that this basin or the next one" and a distance to the
 * metre implies the two points are that accurate. They are not: both are
 * somebody standing near a thing with a phone.
 */
function distanceLabel(metres: number, unit: ProximitySearchUnit): string {
	const amount = convertUnitAmount(metres, 'meter', unit.unitCode) ?? metres;
	const rounded = amount < 10 ? Math.round(amount) : Math.round(amount / 10) * 10;
	return proximityLabel(rounded, unit);
}
