---
'@simmer-mosquito/admin': patch
---

Fixed: creating an Organization now refuses a field sent as something other than text, such as a number for the mailing country, with a message naming the field. It used to save that field as blank. The option that makes you the owner refuses anything but on or off, where it used to read any other value as off.
