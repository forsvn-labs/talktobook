# TalkToBook status

Updated 2026-10-23. Evidence is [merged PR #4](https://github.com/forsvn-labs/talktobook/pull/4)
at `a7519b152b765010637d0cf2856492fc51dc94d0`.

## Delivered source

The canonical public repository now has one self-contained product at its
root: CLI, local web converter, tests, authored samples, public assets,
licenses, and placeholder configuration. The reviewed snapshot contains
81 files. Internal operator material and generated editions are absent
from the current product tree.

Conversion uses a Pandoc sandbox, removes body resource requests and raw
markup, preserves creator attribution, and writes completed EPUBs and
job state atomically. Blocking sample work and capability probes leave
the event loop; cover rendering has at most two workers.

Recorded checks pass: 31 Python tests, 13 generated-EPUB security checks
with synthetic inputs, locked UI install/build/lint, snapshot byte
comparison, and credential scanning with zero candidates.
Paired fixtures improve about 10–19% against the initial sandboxed
implementation. The protected pipeline still costs time compared with
the earlier unprotected one.

## Unverified and not built

The merge proves source delivery. It does not verify a new hosted
deployment. Live YouTube fetching, optional PDF/Kindle runtimes,
physical devices, and production load were not exercised.
No cloud-account or cross-device library service is implemented here.

## Next steps

1. Verify live transcript fetching with an authorized source.
2. Exercise PDF and Kindle outputs on machines with those runtimes.
3. Verify physical-device reading and realistic load before extending
   capability or performance claims.

There is no separate active implementation recorded beyond those
acceptance gaps. Keep new work and its evidence in this file.
