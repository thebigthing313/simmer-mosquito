---
'@simmer-mosquito/admin': patch
---

Changed: When the server refuses a write because the values are wrong, the
operator console now shows what the server said rather than a stock sentence.
That refusal carried its explanation in a field the console did not read, so
every one of them read "The server refused these values. Check the form and try
again." It now names the command that was refused.
