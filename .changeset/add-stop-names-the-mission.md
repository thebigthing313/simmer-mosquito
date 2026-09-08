---
'@simmer-mosquito/web': patch
---

Fixed: adding a stop to a mission with no name reads as a sentence again. A
mission you have not named is listed by what it is and when it runs, so the
add-stop screen was reading "Draw where the crew has to go on Source Reduction
on Aug 4, 2026, 11:00 AM", with the preposition twice.

The instruction and the mission are now two sentences. That screen reads "Draw
where the crew has to go. This stop is for Source Reduction on Aug 4, 2026,
11:00 AM", and a mission you have named reads "This stop is for Evening
Fogging". How a mission with no name is listed has not changed.
