import { Loader2Icon, OctagonXIcon } from '@simmer-mosquito/ui-web/icons/registry';

export function MapStatus({
	error,
	isLoaded,
}: {
	readonly error: Error | null;
	readonly isLoaded: boolean;
}) {
	if (error !== null) {
		return (
			<div className="grid max-w-[min(34rem,calc(100vw-2rem))] gap-1 rounded-md border bg-background px-3 py-2 text-sm text-destructive shadow-md">
				<div className="flex items-center gap-2 font-medium">
					<OctagonXIcon className="size-4" />
					<span>Map unavailable</span>
				</div>
				<span className="line-clamp-2 text-xs text-destructive/80">{error.message}</span>
			</div>
		);
	}

	if (!isLoaded) {
		return (
			<div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-md">
				<Loader2Icon className="size-4 animate-spin" />
				<span>Loading map</span>
			</div>
		);
	}

	return null;
}
