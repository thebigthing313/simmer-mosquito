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
state label from the table above. Two labels below are exceptions:
`external` replaces both, and `tracking` replaces the state alone.

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

## `tracking`

Not a triage state either, and the second carve-out for the same reason
`external` is the first. `tracking` marks a parent issue whose work is on its
children. The parent holds the decisions the children share; the children hold
the briefs and the state.

The category still reads, so `tracking` sits beside `bug` or `enhancement`
rather than replacing it. What it replaces is the state role, because all five
are wrong for a parent: `ready-for-agent` invites one agent to build every
child at once, `ready-for-human` says a person must implement work that is
delegable, and the other three are untrue.

Leave `tracking` out of the "what needs attention" sweep, and out of the
frontier query. A parent surfaces nothing an agent can pick up, and surfacing
it every pass trains the sweep to be ignored. The children are what the
frontier reads, and a blocked child is skipped there by its own dependency
edge.

#449 is the worked example: the draw control cannot change a shape it has
placed, the answer is three tools rather than one, and #495, #496 and #497
carry them as sub-issues in a real chain.

## `deferred`

Not a triage state, and the third carve-out for the reason `external` is the
first. `deferred` marks an issue whose finding is real and whose approach is
agreed, but which waits on a precondition the issue does not control.

The category still reads, so `deferred` sits beside `bug` or `enhancement`
rather than replacing it. What it replaces is the state role, because all five
say something untrue of a deferral. `ready-for-agent` and `ready-for-human` both
say somebody should start. `needs-info` says a reporter owes an answer, when the
answer is a change in the codebase rather than a reply. `wontfix` says the work
will not happen. `needs-triage` says the evaluation is unfinished, when it is
finished and its conclusion is "not yet".

Leave `deferred` out of the "what needs attention" sweep and out of the frontier
query, for the reason `tracking` is left out of both. An issue nobody can start
surfaces nothing to pick up, and surfacing it every pass trains the sweep to be
ignored.

**The body must name the re-entry condition, and it has to be checkable.** A
deferral with no condition is a parking space, and the label rots into one the
first time somebody writes "revisit later". "When the record forms stop gaining
fields" is a condition. "When we have time" is not.

Prefer a GitHub dependency edge where the precondition is itself an issue,
because an open blocker already gates the frontier query and needs no label. Use
`deferred` for the case a dependency edge cannot state: the precondition is a
property of the codebase rather than a ticket somebody filed.

#871 is the worked example. Sixteen record forms carry 2,666 lines of assembly
between them, an owner for it is worth building, and the measurement supporting
that is on the issue. It waits because design work on the forms is unfinished,
and an interface fitted to fifteen forms is the wrong interface for eighteen.
Its re-entry condition is that no record form has open design work, and the
first step on re-entry is to re-run the measurement.
