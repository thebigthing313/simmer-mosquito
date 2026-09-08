import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@simmer-mosquito/ui-web/components/ui/input-group';
import { SearchIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { ComponentProps, ReactNode } from 'react';

/**
 * The search box: a magnifier inside the box on the left, and one trailing
 * control on the right.
 *
 * There were two of these, each documenting itself as the consolidation, and six
 * more files that copied the second one's markup by hand. Three of the copies
 * dropped the clear button, so the only way to empty those boxes was to select
 * the text, and one copy reintroduced the bug the consolidation existed to stop:
 * it cleared by emptying the input while the value behind it was debounced, so
 * the list underneath went on answering text that had left the screen.
 *
 * That is why the trailing slot is typed rather than optional. A box carries
 * either `onClear`, which draws the clear button here once there is something to
 * clear and runs instead of emptying the value, so a debounced caller drops its
 * queued commit in the same handler; or an `endAddon` of its own, which is what
 * a picker whose clear drops the selected record rather than the text passes. It
 * cannot carry neither.
 *
 * The clear control is a plain button rather than `type="search"`'s native
 * affordance, which Firefox does not draw at all and Safari draws differently.
 */
export function SearchInput({
	endAddon,
	onClear,
	label,
	className,
	inputClassName,
	ref,
	type = 'search',
	value,
	...props
}: Omit<ComponentProps<'input'>, 'value'> & {
	/** The value on screen. Whether the clear button is drawn reads off it. */
	readonly value: string;
	/** The accessible name. Says what is searched and by what, e.g. "Search traps by name or code". */
	readonly label: string;
	/** Extra classes for the inner input element. */
	readonly inputClassName?: string;
} & (
		| { readonly onClear: () => void; readonly endAddon?: never }
		| { readonly endAddon: ReactNode; readonly onClear?: never }
	)) {
	return (
		<InputGroup className={className}>
			<InputGroupAddon align="inline-start">
				<SearchIcon aria-hidden="true" />
			</InputGroupAddon>
			<InputGroupInput
				aria-label={label}
				className={inputClassName}
				ref={ref}
				type={type}
				value={value}
				{...props}
			/>
			{trailing(endAddon, onClear, value)}
		</InputGroup>
	);
}

function trailing(
	endAddon: ReactNode,
	onClear: (() => void) | undefined,
	value: string,
): ReactNode {
	const content =
		endAddon ??
		(onClear !== undefined && value.length > 0 ? (
			<InputGroupButton aria-label="Clear search" onClick={onClear} size="icon-xs">
				<XIcon aria-hidden="true" />
			</InputGroupButton>
		) : null);

	return content === null || content === undefined ? null : (
		<InputGroupAddon align="inline-end">{content}</InputGroupAddon>
	);
}
