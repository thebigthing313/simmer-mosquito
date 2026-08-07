import { RequiredMark } from '@simmer-mosquito/ui-web/components/form/required-mark';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useId } from 'react';

/**
 * The geocoder result picker, and the address field, shared by the two places
 * an address gets typed in.
 *
 * There are two address forms and there should be: the standalone GIS form is a
 * `MapSplitPage` with a live map and `useCenterOnPoint`, the inline subform is
 * a compact block inside somebody else's form. Their *bodies* legitimately
 * differ. What did not need to differ was everything in this file, and the cost
 * of it differing is already recorded: #80 was a deadlock in the subform's
 * "Use Manual Coordinates" — it awaited the map click before closing the modal,
 * whose overlay swallowed that very click — and the standalone form had it
 * right the whole time. Eight record forms embed the subform, so all eight were
 * broken until somebody reported it, and the fix landed on one file.
 */

export interface GeocoderResponse {
	readonly results: readonly GeocoderResult[];
}

export interface GeocoderResult {
	readonly formatted_address?: string;
	readonly location?: {
		readonly lat?: number;
		readonly lng?: number;
	};
}

/** The one shape both forms store: a GeoJSON point with a fixed pair. */
export type GeocoderPoint = {
	readonly type: 'Point';
	readonly coordinates: readonly [number, number];
};

export function GeocoderDialog({
	open,
	results,
	onOpenChange,
	onSelect,
	onUseManualCoordinates,
}: {
	readonly open: boolean;
	readonly results: readonly GeocoderResult[];
	readonly onOpenChange: (open: boolean) => void;
	readonly onSelect: (result: GeocoderResult) => void;
	/**
	 * Absent when the caller has no map to place a point on — the subform
	 * embedded in a plain record form. That is the only difference between the
	 * two callers, and it is one prop rather than a second component.
	 */
	readonly onUseManualCoordinates?: (() => void) | undefined;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Choose Geocoder Result</DialogTitle>
					<DialogDescription>
						{onUseManualCoordinates === undefined
							? 'Select the best match for this address.'
							: 'Select the best match or place the address point manually on the map.'}
					</DialogDescription>
				</DialogHeader>
				<div className="grid max-h-80 gap-2 overflow-y-auto">
					{results.length === 0 ? (
						<p className="m-0 rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
							No geocoder results returned.
						</p>
					) : (
						results.map((result) => (
							<button
								className="grid gap-1 rounded-md border border-border/50 bg-background px-3 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
								key={geocoderResultKey(result)}
								onClick={() => onSelect(result)}
								type="button"
							>
								<span className="font-medium">{result.formatted_address}</span>
								<span className="text-muted-foreground text-xs">
									{geocoderResultCoordinates(result)}
								</span>
							</button>
						))
					)}
				</div>
				{onUseManualCoordinates === undefined ? null : (
					<DialogFooter>
						<Button onClick={onUseManualCoordinates} type="button" variant="outline">
							<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
							Use Manual Coordinates
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}

/**
 * A labelled text input for the address fields.
 *
 * Neither address form goes through `useAppForm`, so `FormFieldFrame` — which
 * reads TanStack Form's field context — is not available to them, and the
 * `Field`/`FieldLabel` primitives underneath it do not wire `htmlFor`
 * themselves. This is that wiring, composed from those primitives rather than
 * a hand-rolled `div` + `label`, and existing once instead of twice.
 */
export function LabeledInput({
	label,
	value,
	onValueChange,
	maxLength,
	required = false,
}: {
	readonly label: string;
	readonly value: string;
	readonly onValueChange: (value: string) => void;
	readonly maxLength?: number;
	readonly required?: boolean;
}) {
	const inputId = useId();
	return (
		<Field>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required ? <RequiredMark /> : null}
			</FieldLabel>
			<Input
				aria-required={required ? true : undefined}
				id={inputId}
				maxLength={maxLength}
				onChange={(event) => onValueChange(event.target.value)}
				value={value}
			/>
		</Field>
	);
}

export function pointFromGeocoderResult(result: GeocoderResult): GeocoderPoint | null {
	const lat = result.location?.lat;
	const lng = result.location?.lng;
	if (typeof lat !== 'number' || typeof lng !== 'number') {
		return null;
	}
	return { type: 'Point', coordinates: [lng, lat] };
}

export function geocoderResultCoordinates(result: GeocoderResult): string {
	const point = pointFromGeocoderResult(result);
	return point === null ? 'No coordinates' : geocoderPointSummary(point);
}

export function geocoderResultKey(result: GeocoderResult): string {
	return `${result.formatted_address ?? 'address'}-${geocoderResultCoordinates(result)}`;
}

export function geocoderPointSummary(point: GeocoderPoint): string {
	return `${point.coordinates[1].toFixed(5)}, ${point.coordinates[0].toFixed(5)}`;
}
