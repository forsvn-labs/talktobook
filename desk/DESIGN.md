# Design — E-reader desk

Documented from the built UI (2026-09-07). Operate mode: night reading desk.

## World

Dark room around a lit reader. Restrained cool neutrals, one amber lamp accent.
Not a marketing page; not cream+serif book cliché in the chrome.

## Tokens

- Background: `oklch(0.16 0.01 260)` with slightly deeper sidebar.
- Foreground: warm off-white `oklch(0.92 0.01 80)`.
- Primary / ring: amber `oklch(0.78 0.09 75)`.
- Radius: `0.625rem`. Font: Geist Variable (product sans).
- Soft desk glow behind the device frame.

## Layout

- Top toolbar: Shelf toggle + brand + Ingest / Style / Sync / ⌘K.
- Shelf pushes the device: open = `min(20rem, 40%)` rail, device fills the rest and the frame scales. Closed = device full pane. No overlay drawer.
- Device frame scales down to the stage; native Clara/Libra/Paperwhite CSS pixels stay inside a transform so it never paints over chrome. Kindle uses a flatter bezel; Kobo stays rounder.
- Center stage: device switcher, reading controls, status line, bezel. Drafts add Cook / Make EPUB / Discard.
- Overlays: Contents sheet, Ingest sheet, Style sheet (SSOT CSS), Sync sheet, command dialog.
- URL fetch is only on the Shelf. No scrape-mode toggle.

## Components

shadcn new-york (radix): Button, Sheet, Alert, AlertDialog, Command, Field,
ScrollArea, Badge, ToggleGroup, Switch, Select, Empty, Skeleton, Sonner, Textarea.

## Motion

Short ease-out on device size changes and panel chrome. No page-load choreography.

## States

Empty device, library loading skeletons, library error, Kobo not-mounted Alert,
ingest/sync/style toasts, page-turn disabled until chapter ready, unsaved CSS
blocks Save until the sheet differs from disk. Closing Style keeps that draft;
reopening does not reload from disk over it. Cook on a draft confirm-gates
vault write and optional Hung Library rebuild; Send to cook nests a worker.
