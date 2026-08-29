---
'@simmer-mosquito/web': minor
---

Added: Cleanup Tools for addresses, habitats and contacts. Each page proposes the records that look like duplicates, says what grouped them, and folds a set into whichever one you keep. Addresses are grouped on a shared name, a shared street address, or the same coordinates; habitats on a shared name or sitting within ten metres of each other; contacts on a shared name, email or phone number. Filter the page to one kind of match, and see how many of each there are. One set of records is proposed once however many ways it matched. The confirmation counts what moves before you commit, and merging cannot be undone.

Added: A merge builds the record that survives. Every field is editable in the confirmation, with each value the set holds one click away, so a phone number only the retired record has is kept rather than lost. Values move between fields too: a second number can go into the alternate phone. Left alone, a merge keeps whatever the surviving record already says and fills in only what it left blank.

Added: Notification registrations are a record surface. Record where somebody asked to be warned before spraying, as a point, a line or an area, with a buffer around it. The map draws the buffer rather than a pin, because that is the ground a mission has to reach.

Added: Missions work out who to notify. The Notifications card on a mission lists who is on the list and generates the rest, and says which of "nothing new", "nobody was eligible" and "a buffer unit cannot be measured" happened.
