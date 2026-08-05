import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * A read view that turns into a textarea with explicit Save / Cancel when clicked.
 *
 * Keeps its draft aligned with synced changes while idle; Escape cancels,
 * ⌘/Ctrl+Enter saves. Lives beside the reorder core because both surfaces that
 * order stops also edit the prose attached to them — directions to the next
 * stop, and whatever a crew needs to know before they get there.
 */
export function InlineEditField({
	value,
	ariaLabel,
	emptyLabel,
	textareaPlaceholder,
	disabled = false,
	onSave,
	renderValue,
}: {
	readonly value: string;
	readonly ariaLabel: string;
	readonly emptyLabel: string;
	readonly textareaPlaceholder: string;
	readonly disabled?: boolean;
	readonly onSave: (value: string) => void;
	readonly renderValue: (value: string) => ReactNode;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (!editing) {
			setDraft(value);
		}
	}, [value, editing]);

	useEffect(() => {
		if (!editing) {
			return;
		}
		const node = textareaRef.current;
		if (node !== null) {
			node.focus();
			node.setSelectionRange(node.value.length, node.value.length);
		}
	}, [editing]);

	const save = () => {
		setEditing(false);
		if (draft !== value) {
			onSave(draft);
		}
	};
	const cancel = () => {
		setDraft(value);
		setEditing(false);
	};

	if (editing) {
		return (
			<div className="pointer-events-auto grid gap-1.5">
				<Textarea
					aria-label={ariaLabel}
					className="min-h-[64px] text-sm"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							event.preventDefault();
							cancel();
						} else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							save();
						}
					}}
					placeholder={textareaPlaceholder}
					ref={textareaRef}
					value={draft}
				/>
				<div className="flex items-center gap-2">
					<Button onClick={save} size="sm" type="button">
						Save
					</Button>
					<Button onClick={cancel} size="sm" type="button" variant="ghost">
						Cancel
					</Button>
				</div>
			</div>
		);
	}

	// Read-only callers still get the text; they just cannot open the editor, and a
	// button that does nothing is worse than plain prose.
	if (disabled) {
		return value.trim().length > 0 ? (
			<div className="-mx-1 px-1 py-0.5">{renderValue(value)}</div>
		) : null;
	}

	return (
		<button
			className="-mx-1 pointer-events-auto block w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => setEditing(true)}
			type="button"
		>
			{value.trim().length > 0 ? (
				renderValue(value)
			) : (
				<span className="text-muted-foreground/60 text-xs italic">{emptyLabel}</span>
			)}
		</button>
	);
}
