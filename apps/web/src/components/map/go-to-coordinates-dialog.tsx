import { type ParsedLatLng, parseLatLng } from '@simmer-mosquito/mapping';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type FormEvent, useId, useState } from 'react';
import { focusOnMap } from './map-camera';

const REFUSALS: Record<Extract<ParsedLatLng, { ok: false }>['reason'], string> = {
	unreadable: 'Enter a latitude and longitude, like 40.123456, -74.123456.',
	'out-of-range': 'Latitude must be between -90 and 90, and longitude between -180 and 180.',
};

/**
 * The map right-click menu's Go to coordinates dialog: one field for a pasted
 * `lat, lng`, which flies `map` there on submit and closes. Text that does not
 * read as a coordinate stays in the field with an error under it.
 */
export function GoToCoordinatesDialog({
	map,
	open,
	onOpenChange,
}: {
	readonly map: MapboxMap | null;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent aria-describedby={undefined} className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Go to Coordinates</DialogTitle>
				</DialogHeader>
				{/* Inside the content, so its text and error go when the dialog closes. */}
				<GoToCoordinatesForm
					onCancel={() => onOpenChange(false)}
					onGo={(point) => {
						if (map !== null) {
							focusOnMap(map, point, { purpose: 'place' });
						}
						onOpenChange(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

function GoToCoordinatesForm({
	onCancel,
	onGo,
}: {
	readonly onCancel: () => void;
	readonly onGo: (point: { readonly lng: number; readonly lat: number }) => void;
}) {
	const fieldId = useId();
	const errorId = useId();
	const [text, setText] = useState('');
	const [error, setError] = useState<string | null>(null);

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const parsed = parseLatLng(text);
		if (parsed.ok) {
			onGo(parsed.point);
			return;
		}
		setError(REFUSALS[parsed.reason]);
	};

	return (
		<form className="grid gap-4" noValidate onSubmit={onSubmit}>
			<Field data-invalid={error !== null}>
				<FieldLabel htmlFor={fieldId}>Coordinates</FieldLabel>
				<Input
					aria-describedby={error === null ? undefined : errorId}
					aria-invalid={error !== null}
					autoComplete="off"
					className="tabular-nums"
					id={fieldId}
					onChange={(event) => {
						setText(event.target.value);
						setError(null);
					}}
					placeholder="40.123456, -74.123456"
					spellCheck={false}
					value={text}
				/>
				<FieldError id={errorId}>{error}</FieldError>
			</Field>
			<DialogFooter>
				<Button onClick={onCancel} type="button" variant="ghost">
					Cancel
				</Button>
				<Button type="submit">Go</Button>
			</DialogFooter>
		</form>
	);
}
