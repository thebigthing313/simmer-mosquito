import { Button } from '@simmer/ui/components/button';
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLegend,
	FieldSet,
} from '@simmer/ui/components/field';
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@simmer/ui/components/input-group';
import { ClipboardPaste } from 'lucide-react';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import { withForm } from '../form-context';

export const CoordinatesFieldGroup = withForm({
	defaultValues: {
		lat: null as number | null,
		lng: null as number | null,
	},
	props: {
		title: 'Coordinates',
		required: true,
	},
	render: function Render({ form, title, required }) {
		const handlePaste = useCallback(async () => {
			try {
				const text = await navigator.clipboard.readText();
				// Matches integers or decimals, including negative signs
				const matches = text.match(/-?\d+(\.\d+)?/g);

				if (matches && matches.length >= 2) {
					const lat = parseFloat(matches[0]);
					const lng = parseFloat(matches[1]);

					if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
						// TanStack Form batch update
						form.setFieldValue('lat', lat);
						form.setFieldValue('lng', lng);
					}
				}
			} catch (err) {
				console.error('Failed to read clipboard:', err);
			}
		}, [form]);

		return (
			<FieldSet>
				<div className="flex flex-row items-center justify-between">
					<FieldLegend>
						{title} {required ? ' *' : ''}
					</FieldLegend>
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						onClick={handlePaste}
						title="Paste coordinates (Lat, Lng)"
					>
						<ClipboardPaste />
					</Button>
				</div>

				<FieldDescription>Must be in decimal degrees format.</FieldDescription>

				<form.AppField name="lat">
					{(field) => (
						<Field
							aria-required={required}
							data-invalid={!field.state.meta.isValid}
						>
							<CoordinateInput
								value={field.state.value}
								type="lat"
								placeholder="Latitude"
								onInputChange={(value) => field.handleChange(value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</Field>
					)}
				</form.AppField>

				<form.AppField name="lng">
					{(field) => (
						<Field
							aria-required={required}
							data-invalid={!field.state.meta.isValid}
						>
							<CoordinateInput
								value={field.state.value}
								type="lng"
								placeholder="Longitude"
								onInputChange={(value) => field.handleChange(value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</Field>
					)}
				</form.AppField>
			</FieldSet>
		);
	},
});

interface CoordinateInputProps
	extends Omit<
		ComponentProps<typeof InputGroupInput>,
		'value' | 'onChange' | 'type'
	> {
	type: 'lat' | 'lng';
	value: number | null;
	onInputChange: (value: number | null) => void;
}

function CoordinateInput({
	value,
	onInputChange,
	type,
	...props
}: CoordinateInputProps) {
	// Local string buffer to handle intermediate states like trailing decimals "12."
	const [displayString, setDisplayString] = useState(
		value !== null ? Math.abs(value).toString() : '',
	);

	// Sync internal string with external numeric value
	useEffect(() => {
		const absoluteValue = value !== null ? Math.abs(value).toString() : '';
		const currentNum = parseFloat(displayString);
		const incomingNum = value !== null ? Math.abs(value) : NaN;

		if (currentNum !== incomingNum) {
			if (Number.isNaN(incomingNum)) {
				setDisplayString('');
			} else {
				setDisplayString(absoluteValue);
			}
		}
	}, [value, displayString]);

	const getDirection = (val: number | null) => {
		if (val === null) return type === 'lat' ? 'N' : 'W';
		if (type === 'lat') return val >= 0 ? 'N' : 'S';
		return val >= 0 ? 'E' : 'W';
	};

	const direction = getDirection(value);

	const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const rawValue = e.target.value;

		if (rawValue === '' || rawValue === '.') {
			setDisplayString(rawValue);
			onInputChange(null);
			return;
		}

		// Only allow digits and a single decimal point
		if (/^\d*\.?\d*$/.test(rawValue)) {
			setDisplayString(rawValue);
			const numValue = parseFloat(rawValue);
			if (!Number.isNaN(numValue)) {
				const multiplier = direction === 'S' || direction === 'W' ? -1 : 1;
				onInputChange(numValue * multiplier);
			}
		}
	};

	const toggleDirection = () => {
		const currentValue = value ?? 0;
		// Flip sign. currentValue === 0 ? -0 handles the toggle intent even at zero
		onInputChange(currentValue === 0 ? -0 : currentValue * -1);
	};

	return (
		<InputGroup>
			<InputGroupInput
				{...props}
				type="text"
				inputMode="decimal"
				value={displayString}
				onChange={handleTextChange}
			/>
			<InputGroupAddon align="inline-start">
				<InputGroupButton type="button" tabIndex={-1} onClick={toggleDirection}>
					{direction}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}
