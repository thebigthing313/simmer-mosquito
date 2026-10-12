---
'@simmer-mosquito/web': patch
---

Fixed: A mission that was never started reads "Past due" once its scheduled day has gone by, on the Operations overview, the missions map list and card, the mission page and a request's linked missions. It used to read "Scheduled" everywhere but the Dashboard. The rain date does not change it.
