import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useEffect } from 'react';

/**
 * PROTOTYPE. The floating bar that flips a page between throwaway variants.
 *
 * Not product UI: it is high-contrast on purpose so nobody reads it as part of
 * the design under review, and it renders nothing in a production build so a
 * stray merge cannot ship it.
 */
export function PrototypeSwitcher({
	variants,
	current,
	onChange,
}: {
	readonly variants: readonly { readonly key: string; readonly name: string }[];
	readonly current: string;
	readonly onChange: (key: string) => void;
}) {
	const index = Math.max(
		0,
		variants.findIndex((variant) => variant.key === current),
	);
	const previous = variants[(index - 1 + variants.length) % variants.length];
	const next = variants[(index + 1) % variants.length];
	const active = variants[index];

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			if (
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.isContentEditable
			) {
				return;
			}
			if (event.key === 'ArrowLeft' && previous) {
				onChange(previous.key);
			} else if (event.key === 'ArrowRight' && next) {
				onChange(next.key);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [previous, next, onChange]);

	if (import.meta.env.PROD || !active || !previous || !next) {
		return null;
	}

	return (
		<div className="-translate-x-1/2 fixed bottom-4 left-1/2 z-50 flex items-center gap-2 rounded-full border border-foreground bg-foreground px-2 py-1 text-background shadow-lg">
			<Button
				aria-label="Previous variant"
				className="size-7 rounded-full text-background hover:bg-background/20 hover:text-background"
				onClick={() => onChange(previous.key)}
				size="icon"
				variant="ghost"
			>
				<ChevronLeftIcon aria-hidden="true" className="size-4" />
			</Button>
			<span className="px-1 font-medium text-sm tabular-nums">
				{active.key} · {active.name}
			</span>
			<Button
				aria-label="Next variant"
				className="size-7 rounded-full text-background hover:bg-background/20 hover:text-background"
				onClick={() => onChange(next.key)}
				size="icon"
				variant="ghost"
			>
				<ChevronRightIcon aria-hidden="true" className="size-4" />
			</Button>
		</div>
	);
}
