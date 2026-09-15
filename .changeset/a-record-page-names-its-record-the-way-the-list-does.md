---
'@simmer-mosquito/web': patch
---

Changed: the small type line over a record's name reads the same word the list
it came from uses. A biocontrol action's page said `Biocontrol`, an outreach
action's said `Outreach`, and a chemical application's said `Application`; they
read `Biocontrol Action`, `Outreach Action` and `Chemical Application` now. A
larval inspection's page said `Larval inspection` and a sample's `Larval
sample`; they read `Inspection` and `Sample`, which is what the Larval
Surveillance sidebar and the pages listing them already called each.

Changed: the edit page for a biocontrol action is titled `Edit Biocontrol
Action` rather than `Edit Biocontrol`, and the one for an outreach action `Edit
Outreach Action` rather than `Edit Outreach`.

Changed: the card that opens when a biocontrol action or an outreach action is
clicked on a map names it `Biocontrol Action` or `Outreach Action`, in its type
line and in the heading it shows while the record loads, rather than
`Biocontrol` or `Outreach`.

Changed: the Control Operations sidebar group that lists chemical applications
is headed `Chemical Applications`, the same words as the page it opens, rather
than `Chemical`.
