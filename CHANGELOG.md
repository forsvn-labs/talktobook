# TalkToBook changelog

## 2026-11-11 — Validated editions and optional support

- Shipped the free browser support link to the owner's existing GitHub Sponsors.
- Fixed malformed XML from metadata/source text and protected prior CLI outputs
  from empty-input replacement. Browser saves request exclusive access and
  recheck conflicts before commit.
- Public source PR #8 merged as `6601307`; live static version
  `c5d2b157-c29d-416e-a882-eb6771f96cc0` passed acceptance. Official EPUBCheck
  passes 14 synthetic editions and two live downloads. Physical proof remains open.


## 2026-11-11

- The free browser converter is live at https://talktobook.forsvn.com. It
  produces attributed EPUB and Markdown on the device, with a vector cover.
- Large blank-line inputs complete without quadratic cleanup. Old file reads
  cannot replace newer source choices; cancellation preserves the last edition.
- EPUB XML rejects forbidden Unicode, and file saving rechecks the destination.
- No account, source upload, ad activation or paid binding was added.


No release or verified hosted deployment is established by the recorded
merge evidence. The dated source-merge entries are preserved in
[PROGRESS.md](PROGRESS.md). Add shipped work here when delivery is verified.
