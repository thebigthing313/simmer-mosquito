# Triage labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Category labels

The two category roles map to GitHub's own defaults, already in the repo:
`bug` and `enhancement`. A triaged issue carries one category label and one
state label from the table above. The one exception is `external` below, which
replaces both.

## `external`

Not a triage state. `external` marks an issue whose resolution is in somebody
else's repository, so no state role applies and neither category does either:
nothing here is broken and nothing here is scheduled.

An issue carries it when the finding is real but the fix is upstream. It stays
open as a reminder to build a reproduction and, if the reproduction holds, to
report it. #161 is the worked example: a TanStack package cannot serialize a
Temporal value into a pushed-down where clause, this repo works around it by
staying on native `Date`, and the upstream half is unwritten.

Leave `external` out of the "what needs attention" sweep. An issue waiting on a
reproduction nobody has scheduled is not work in progress, and surfacing it every
pass trains the sweep to be ignored.

An `external` issue that turns out to need a change here too gets the ordinary
category and state labels alongside it.
