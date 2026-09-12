# TalkToBook (ipse)


## Read first

Before any work in this repo, read:

1. `INDEX.md` — map of this tree
2. `VISION.md`, `ROADMAP.md`, `PROGRESS.md`, `CHANGELOG.md`

Desk memory is `../../MEMORY.md` on the workspace, not in this repo.

Then continue with the rest of this file.

Public product in `app/`, Hung's Kobo desk in `desk/`.

Public export is `app/` → `forsvn-labs/talktobook`. Do not push that
mirror from this lane without Hung's approval. `desk/` stays private.

## Run the desk

```bash
sh forsvn/talktobook/desk/run.sh
```

UI: http://127.0.0.1:5173 (proxies `/api` to :8650).

## Engine

- SSOT: `desk/talktobook/build.py`
- Mirror copy: `app/scripts/build.py`
- Skill: `skills/talktobook/`

Edit the desk file, copy it to `app/scripts/build.py`, then run
`python3 skills/learn-library-cook/scripts/test_cook_pipeline.py`.
