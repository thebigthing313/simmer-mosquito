---
'@simmer-mosquito/web': minor
---

Added: the Dashboard at `/`, the state of the Organization for the person
deciding what happens next. Two backlog panels, Surveillance and Operations,
list seven queues of pending work as a count and the age of the oldest, and
each name is a link that opens the explorer with its filters set to the rows
the count counted: samples and collections awaiting identification, collections
with a problem in the last 14 days, open service requests split into new and in
progress, requests for control not yet assigned, assignments started and not
finished, and missions due today or overdue. A banner between them counts the
untreated habitats, the ones heavy in the last 7 days with no control action
since, and opens the habitats explorer on the new `Untreated` filter; at zero it
says `No untreated habitats` so you can see the check ran. `Last 7 days` is a
strip of counts for the week ending today against the week before, one cell
per record type the Organization has ever recorded. `In the field today` lists
everyone who logged field work today, most records first, each name opening
their day on the Activity Monitor. The collections explorer gains an `Awaiting
identification` filter and the requests-for-control explorer a `Not yet
assigned` one, so the Dashboard's rows are reachable by hand as well as by
link. The problem collections, service requests, assignments and missions
queues move the moment a record is saved; the rest re-reads when the tab comes
back into focus and every five minutes.
