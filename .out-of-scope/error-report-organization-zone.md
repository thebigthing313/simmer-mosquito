# The error report's Time row in the Organization's zone

`ErrorReport` in `packages/ui-web` draws a `Time` row on the error surface. It
reads the machine's clock in the machine's zone, worded in `en-US`, and that
stays as it is. It does not take a `timeZone` prop and it does not read the
Organization's settings.

## Why this is out of scope

The row is for the person looking at the screen. It is what a Collector reads
back when they say "it broke at three", and three is their own clock. Putting
the Organization's zone on it would show a Collector on the road an hour that
is not the one on their wrist.

The support thread wants the exact instant, and it has it already: the copied
report carries `new Date().toISOString()`, which lines up with a server log in
any zone. So the two readers each have the time they need, and a zone prop
would serve neither.

There is also nowhere to get the zone from on two of the three frames that draw
the report. `WorkspaceChromeError` draws when the workspace did not finish
loading, before the Organization's settings have synced, and `apps/admin` is
the operator console with no Organization at all. A prop every caller must
supply, that two of them cannot, is a fallback wearing a parameter's clothes.

The rule this sits inside is #154 and #156: an operational date, the day a
record belongs to, is the Organization's. The moment an error surface drew is
not an operational date. Nothing is keyed on it and no record carries it.

## Prior requests

- #1129 (2026-09-17). Filed while pinning the row's wording to `en-US` (#1116).
