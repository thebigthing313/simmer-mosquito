import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from '@simmer-mosquito/ui-web/components/ui/input-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { ComponentProps, ReactNode } from 'react';

const SearchIcon = iconRegistry.actions.search.icon;

/**
 * The one search field used across the app. A magnifying glass sits inside the
 * box on the left; an optional trailing slot carries whatever the caller needs
 * there — a keyboard hint in the header, a clear button on the map. Centralizing
 * it keeps every search affordance visually identical.
 */
export function SearchInput({
	endAddon,
	className,
	inputClassName,
	ref,
	type = 'search',
	...props
}: ComponentProps<'input'> & {
	/** Trailing content rendered as an inline-end addon (Kbd hint, clear button). */
	readonly endAddon?: ReactNode;
	/** Extra classes for the inner input element. */
	readonly inputClassName?: string;
}) {
	return (
		<InputGroup className={className}>
			<InputGroupAddon align="inline-start">
				<SearchIcon aria-hidden="true" />
			</InputGroupAddon>
			<InputGroupInput className={inputClassName} ref={ref} type={type} {...props} />
			{endAddon ? <InputGroupAddon align="inline-end">{endAddon}</InputGroupAddon> : null}
		</InputGroup>
	);
}
