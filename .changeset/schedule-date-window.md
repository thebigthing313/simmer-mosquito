---
'@simmer-mosquito/web': patch
---

Fixed: The date window on Missions and Assignments can now end after today. The End picker reaches future days, and the presets are Recent and Upcoming, Next 7 Days, Next 30 Days, Last 7 Days and All Time. Recent and Upcoming is the window each page opens on, so one click brings it back. Before, End stopped at today and every preset but All Time ended today, which hid every mission and assignment scheduled ahead.
