import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldSet,
	FieldTitle,
} from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	NativeSelect,
	NativeSelectOption,
} from '@simmer-mosquito/ui-web/components/ui/native-select';
import { Slider } from '@simmer-mosquito/ui-web/components/ui/slider';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { SaveIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/sandbox')({
	component: SandboxPage,
});

const variants = ['default', 'secondary', 'outline', 'ghost', 'destructive'] as const;
const sizes = ['default', 'sm', 'lg'] as const;

function SandboxPage() {
	const [label, setLabel] = useState('Save record');
	const [variant, setVariant] = useState<(typeof variants)[number]>('default');
	const [size, setSize] = useState<(typeof sizes)[number]>('default');
	const [disabled, setDisabled] = useState(false);
	const [showIcon, setShowIcon] = useState(true);
	const [viewport, setViewport] = useState(640);

	return (
		<div className="workshop-page">
			<header className="preview-page-header">
				<div>
					<p className="preview-eyebrow">Phase 4</p>
					<h1>Component Sandbox</h1>
				</div>
				<p>
					Interactive prop controls and a resizeable preview frame for quick component stress
					checks.
				</p>
			</header>

			<div className="sandbox-layout">
				<section className="preview-section">
					<div className="preview-section-header">
						<div>
							<p className="preview-eyebrow">Controls</p>
							<h2>Button props</h2>
						</div>
					</div>
					<FieldSet>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="button-label">Label</FieldLabel>
								<Input
									id="button-label"
									onChange={(event) => setLabel(event.target.value)}
									value={label}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="button-variant">Variant</FieldLabel>
								<NativeSelect
									id="button-variant"
									onChange={(event) => setVariant(event.target.value as typeof variant)}
									value={variant}
								>
									{variants.map((option) => (
										<NativeSelectOption key={option} value={option}>
											{option}
										</NativeSelectOption>
									))}
								</NativeSelect>
							</Field>
							<Field>
								<FieldLabel htmlFor="button-size">Size</FieldLabel>
								<NativeSelect
									id="button-size"
									onChange={(event) => setSize(event.target.value as typeof size)}
									value={size}
								>
									{sizes.map((option) => (
										<NativeSelectOption key={option} value={option}>
											{option}
										</NativeSelectOption>
									))}
								</NativeSelect>
							</Field>
							<Field>
								<FieldLabel>Viewport width</FieldLabel>
								<Slider
									max={960}
									min={280}
									onValueChange={(value) => setViewport(value[0] ?? viewport)}
									step={20}
									value={[viewport]}
								/>
								<FieldDescription>{viewport}px preview frame</FieldDescription>
							</Field>
							<Field orientation="horizontal">
								<Switch checked={showIcon} onCheckedChange={setShowIcon} />
								<FieldTitle>Show leading icon</FieldTitle>
							</Field>
							<Field orientation="horizontal">
								<Switch checked={disabled} onCheckedChange={setDisabled} />
								<FieldTitle>Disabled state</FieldTitle>
							</Field>
						</FieldGroup>
					</FieldSet>
				</section>

				<section className="sandbox-stage preview-section">
					<div className="preview-section-header">
						<div>
							<p className="preview-eyebrow">Preview</p>
							<h2>Button</h2>
						</div>
					</div>
					<div className="viewport-rail">
						<div className="viewport-frame" style={{ maxWidth: `${viewport}px` }}>
							<Button disabled={disabled} size={size} type="button" variant={variant}>
								{showIcon ? <SaveIcon aria-hidden="true" /> : null}
								{label || 'Untitled action'}
							</Button>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
