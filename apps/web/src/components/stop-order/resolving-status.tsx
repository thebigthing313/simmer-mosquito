/**
 * What a stop draws where its status badge goes while the record behind it has
 * not streamed in. The words are the ones `TargetLink` draws on an assignment
 * stop in the same state.
 */
export function ResolvingStatus() {
	return <span className="shrink-0 text-muted-foreground text-xs">Loading…</span>;
}
