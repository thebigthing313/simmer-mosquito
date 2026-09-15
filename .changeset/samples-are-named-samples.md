---
'@simmer-mosquito/web': patch
---

Fixed: a sample taken at no habitat is called a sample. Three surfaces called it
an inspection when it had no coordinates to show either: the row in the samples
explorer, the sample's map card and the Awaiting Identification panel on the
larval overview each read `Ad-hoc inspection` and now read `Ad-hoc sample`. The
inspection surfaces beside them are unchanged.
