import { tagPalette } from '@simmer-mosquito/design-tokens';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { PlusIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

export interface ColorPickerProps {
	readonly value: string | null;
	readonly onChange: (next: string | null) => void;
	readonly disabled?: boolean;
	readonly label?: string;
}

const fallbackColor = '#1b7e53';
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

export function ColorPicker({
	disabled = false,
	label = 'Pick color',
	onChange,
	value,
}: ColorPickerProps) {
	const [open, setOpen] = useState(false);
	const [customHex, setCustomHex] = useState(normalizeHexColor(value) ?? fallbackColor);
	const selectedColor = normalizeHexColor(value);
	const customColor = normalizeHexColor(customHex);

	useEffect(() => {
		if (selectedColor !== null) {
			setCustomHex(selectedColor);
		}
	}, [selectedColor]);

	function selectPreset(hex: string) {
		onChange(hex);
		setCustomHex(hex);
		setOpen(false);
	}

	function applyCustomColor() {
		if (customColor === null) {
			return;
		}

		onChange(customColor);
		setCustomHex(customColor);
		setOpen(false);
	}

	function clearColor() {
		onChange(null);
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					disabled={disabled}
					className={cn(
						'border-border bg-background p-0 shadow-xs hover:border-ring hover:bg-background',
						selectedColor !== null && 'border-(--color-picker-value)',
					)}
					style={
						selectedColor === null
							? undefined
							: ({ '--color-picker-value': selectedColor } as CSSProperties)
					}
					aria-label={label}
				>
					{selectedColor === null ? (
						<PlusIcon aria-hidden="true" />
					) : (
						<span
							aria-hidden="true"
							className="size-4 rounded-sm border border-border/60 bg-(--color-picker-value)"
						/>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-60 p-3" align="start">
				<div className="flex flex-col gap-3">
					<div className="grid gap-1">
						<p className="m-0 text-[0.78rem] font-bold text-foreground">Color</p>
						<p className="m-0 text-[0.76rem] text-muted-foreground">Choose a tag swatch.</p>
					</div>
					<div className="grid grid-cols-7 gap-1.5">
						{tagPalette.map(({ hex, label: swatchLabel }) => (
							<Button
								key={hex}
								type="button"
								variant="outline"
								size="icon-xs"
								onClick={() => selectPreset(hex)}
								className={cn(
									'border-border p-0 transition-transform hover:scale-110 hover:bg-background',
									selectedColor === hex.toUpperCase() && 'ring-2 ring-ring ring-offset-1',
								)}
								style={{ backgroundColor: hex }}
								aria-label={`Select ${swatchLabel}`}
							/>
						))}
					</div>
					<div className="flex items-center gap-2 border-border border-t pt-2">
						<Input
							type="color"
							value={customColor ?? fallbackColor}
							onChange={(event) => setCustomHex(event.target.value)}
							className="size-8 shrink-0 cursor-pointer p-1"
							aria-label="Custom color"
						/>
						<Input
							value={customHex}
							onChange={(event) => setCustomHex(event.target.value)}
							placeholder="#1B7E53"
							className="h-8 flex-1 px-2 font-mono text-xs uppercase"
							aria-invalid={customHex.length > 0 && customColor === null}
						/>
						<Button
							type="button"
							size="sm"
							className="h-8"
							disabled={customColor === null}
							onClick={applyCustomColor}
						>
							Apply
						</Button>
					</div>
					{selectedColor !== null ? (
						<Button type="button" variant="ghost" size="sm" onClick={clearColor}>
							<XIcon data-icon="inline-start" aria-hidden="true" />
							Clear color
						</Button>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function normalizeHexColor(value: string | null): string | null {
	const text = value?.trim();
	if (!text) {
		return null;
	}

	const normalized = text.startsWith('#') ? text : `#${text}`;
	return hexColorPattern.test(normalized) ? normalized.toUpperCase() : null;
}
