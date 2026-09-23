---
"@simmer-mosquito/web": patch
---

Added: a Mission stop can carry a name somebody typed. The Add a Stop form takes an optional Name, and a Manager renames a stop from its row on the mission page, where clearing the box puts the derived name back. The stop list draws the stored name ahead of the Requested Control Action it came from and the Address it sits at, so two stops drawn on the map are told apart by more than their ordinals; a named stop still links back to its request from the line below. A stop nobody named reads exactly as it did.
