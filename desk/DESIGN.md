# Design — E-reader desk

Documented from the built UI (2026-09-17). Operate mode: paper reading desk.

## World

A quiet publishing desk around a lit device. Warm paper, ink type, oxblood as a
mark. The shelf and device share one view. Not a marketing page.

## Tokens

- Background / paper: `#F7F0E5`. Panel: `#FFFAF2`. Paper-2 shelf: `#EFE5D8`.
- Ink: `#1E1A17`. Secondary copy: `#514842`.
- Accent / ring / checks / wordmark rule: oxblood `#7F1D1D`. Never a hero fill.
- Radius: `0.5rem`. Font: Geist Variable (product sans).
- Device bezel stays dark plastic; the page inside stays e-ink paper.

## Layout

- Top toolbar: Shelf toggle + brand (oxblood hairline) + Ingest / Style / Sync / ⌘K.
- Shelf pushes the device: open = resizable rail, device fills the rest and the frame scales. Closed = device full pane. No overlay drawer.
- Device frame scales down to the stage; native Clara/Libra/Paperwhite CSS pixels stay inside a transform so it never paints over chrome. Kindle uses a flatter bezel; Kobo stays rounder.
- Center stage: device switcher, reading controls, status line, bezel. Drafts add Cook / Make EPUB / Discard.
- Overlays: Contents sheet, Ingest sheet, Style sheet (SSOT CSS), Sync sheet, command dialog.
- URL fetch is only on the Shelf. No scrape-mode toggle.
- Confirm still gates every vault and Drive write.

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
