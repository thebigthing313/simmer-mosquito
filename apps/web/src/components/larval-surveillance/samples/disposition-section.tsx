import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { useId, useState } from 'react';
import { SectionLabel } from './section-label';

/**
 * The four disposition writes, named.
 *
 * A record of callbacks rather than one `onPatch` taking a draft mutator: each
 * of these is a different domain command, and the control that fires it is the
 * only thing that knows which.
 */
export interface SampleDisposition {
	readonly setZeroLarvae: (next: boolean) => Promise<void>;
	readonly setNonMosquito: (next: boolean) => Promise<void>;
	readonly setUnidentifiableReason: (next: string) => Promise<void>;
	readonly rename: (next: string) => Promise<void>;
}

/**
 * The disposition flags and labels on a sample: two switches and two text
 * fields that each commit on blur or Enter. Takes the current values and the
 * four writes, named.
 */
export function DispositionSection({
	isZeroLarvae,
	hasNonMosquito,
	unidentifiableReason,
	displayName,
	hasSpecies,
	canManage,
	disposition,
}: {
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly displayName: string | null;
	readonly hasSpecies: boolean;
	readonly canManage: boolean;
	readonly disposition: SampleDisposition;
}) {
	return (
		<div className="grid gap-3 border-border/50 border-t pt-4">
			<SectionLabel>Disposition</SectionLabel>

			{hasSpecies ? (
				<p className="m-0 text-muted-foreground text-xs">
					A sample with identified species always reads as <em>Identified</em>, regardless of the
					flags below.
				</p>
			) : null}

			<SwitchRow
				checked={isZeroLarvae}
				description="Examined and held no mosquito larvae."
				disabled={!canManage || hasSpecies}
				label="No larvae found"
				onCheckedChange={(next) => void disposition.setZeroLarvae(next)}
			/>
			<SwitchRow
				checked={hasNonMosquito}
				description="Contains non-mosquito organisms or debris."
				disabled={!canManage}
				label="Non-mosquito material"
				onCheckedChange={(next) => void disposition.setNonMosquito(next)}
			/>

			<TextPatchField
				canManage={canManage}
				description="Note why the specimens could not be identified. Clearing it removes the flag."
				label="Unidentifiable reason"
				onCommit={(value) => disposition.setUnidentifiableReason(value)}
				placeholder="e.g. specimens too damaged to key out"
				value={unidentifiableReason ?? ''}
			/>

			<TextPatchField
				canManage={canManage}
				description="An optional label to identify this sample in lists."
				label="Sample label"
				onCommit={(value) => disposition.rename(value)}
				placeholder="e.g. North culvert, jar 3"
				value={displayName ?? ''}
			/>
		</div>
	);
}

function SwitchRow({
	label,
	description,
	checked,
	disabled,
	onCheckedChange,
}: {
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly disabled: boolean;
	readonly onCheckedChange: (next: boolean) => void;
}) {
	// Radix Switch renders a button, not a native input, so associate the text via
	// aria-labelledby rather than nesting the control in a <label>.
	const labelId = `switch-${useId()}`;
	return (
		<div className="flex items-start justify-between gap-3">
			<span className="grid gap-0.5" id={labelId}>
				<span className="font-medium text-foreground text-sm">{label}</span>
				<span className="text-muted-foreground text-xs">{description}</span>
			</span>
			<Switch
				aria-labelledby={labelId}
				checked={checked}
				className="mt-0.5"
				disabled={disabled}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}

function TextPatchField({
	label,
	description,
	value,
	placeholder,
	canManage,
	onCommit,
}: {
	readonly label: string;
	readonly description: string;
	readonly value: string;
	readonly placeholder: string;
	readonly canManage: boolean;
	readonly onCommit: (value: string) => Promise<void>;
}) {
	// The draft is held beside the stored value it was typed over, so a value
	// that changes out from under the input reads as the new value with no
	// reset, and no render draws the old draft over it.
	const [held, setHeld] = useState({ stored: value, draft: value });
	const draft = held.stored === value ? held.draft : value;
	const setDraft = (next: string) => setHeld({ stored: value, draft: next });
	const [busy, setBusy] = useState(false);

	const commit = async () => {
		const next = draft.trim();
		if (next === value.trim()) {
			setDraft(value);
			return;
		}
		setBusy(true);
		await onCommit(next).finally(() => setBusy(false));
	};

	if (!canManage) {
		if (value.trim().length === 0) {
			return null;
		}
		return (
			<div className="grid gap-1">
				<SectionLabel>{label}</SectionLabel>
				<p className="m-0 text-foreground text-sm">{value}</p>
			</div>
		);
	}

	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">{label}</span>
			<Input
				aria-label={label}
				disabled={busy}
				onBlur={() => void commit()}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void commit();
					}
				}}
				placeholder={placeholder}
				value={draft}
			/>
			<span className="text-muted-foreground text-xs">{description}</span>
		</div>
	);
}
