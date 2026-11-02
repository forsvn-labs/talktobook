# Progress

Updated: 2026-10-23 · Stage: building · Health: At risk

The public product source is built. A hosted deployment is unverified.
No separate active implementation is recorded beyond the acceptance gaps below.

Next action: Verify live transcript fetching with an authorized source. Assignee is not recorded.

## Current state

| State | Item | Evidence | Date |
| --- | --- | --- | --- |
| Built, not shipped | CLI, agent skill, local web converter, samples, assets, licenses, placeholder configuration | [PR #4](https://github.com/forsvn-labs/talktobook/pull/4), merge `a7519b152b765010637d0cf2856492fc51dc94d0`; deployment unverified | 2026-10-23 |
| Next | Verify live YouTube transcript fetching with an authorized source | Legacy STATUS next step 1 | 2026-10-23 |
| Next | Exercise optional PDF and Kindle outputs on machines with those runtimes | Legacy STATUS next step 2 | 2026-10-23 |
| Next | Verify physical-device reading and realistic load | Legacy STATUS next step 3 | 2026-10-23 |

## Gates

- Verify physical devices and realistic load before extending capability or performance claims.
- Preserve creator attribution in Markdown and EPUB. Use synthetic transcripts or authored demo samples in tests.
- Keep environment files, user transcripts, generated books, job state, and credentials out of Git.

## 2026-11-01

- Migrated the records to PROGRESS. The old STATUS.md and merge-only
  CHANGELOG.md are in commit `3c437735a29519a9689cfc211d0bcf5eb7326704`.
  Historical evidence retains its original dates. Deployment, live inputs,
  devices, load, and external access were not rechecked.

## 2026-10-23

- Built the reviewed 81-file public product snapshot at the repository root
  ([PR #4](https://github.com/forsvn-labs/talktobook/pull/4), `a7519b1`).
  CLI, local web converter, tests, authored samples, assets, licenses, and
  placeholder configuration are self-contained. Internal operator material
  and generated editions are absent from that product tree.
- Hardened conversion with a Pandoc sandbox, removal of body resource
  requests and raw markup, creator attribution, and atomic completed EPUB
  and job-state writes. Tightened input and job handling.
  Moved blocking sample work and capability probes off
  the event loop. Cover rendering uses at most two workers.
- Recorded 31 passing Python tests, 13 generated-EPUB security checks with
  synthetic inputs, locked UI install/build/lint, snapshot byte comparison,
  and a credential scan with zero candidates. Paired fixtures improved about
  10–19% against the initial sandboxed implementation. The protected pipeline
  still costs time against the earlier unprotected one. These are dated results.
- Kept hosted deployment, live YouTube fetching, optional PDF/Kindle runtimes,
  physical devices, and production load unverified. No cloud-account or
  cross-device library service is implemented here.
- Adopted the four root records
  ([PR #5](https://github.com/forsvn-labs/talktobook/pull/5)).

## 2026-09-20

- Built preview-first EPUB conversion, lazy samples, fewer stale rebuilds,
  and local fonts ([PR #3](https://github.com/forsvn-labs/talktobook/pull/3),
  `976a9e3`). This is source-merge evidence, not a verified deployment.

## 2026-09-17

- Built the React converter and designed reading page
  ([PR #2](https://github.com/forsvn-labs/talktobook/pull/2)). This is
  source-merge evidence, not a verified deployment.
