import type {
  ApiErrorBody,
  DeviceStatus,
  InboxItem,
  JobSnapshot,
  LibraryResponse,
  SpineManifest,
  SyncPlanItem,
} from "./types"

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error(
      res.ok
        ? "Server returned non-JSON."
        : `Request failed (${res.status}). Try again.`,
    )
  }
  if (!res.ok) {
    const body = (data || {}) as ApiErrorBody
    throw new Error(humanError(body, res.status))
  }
  return data as T
}

export type CookResult = ApiErrorBody & {
  drafts?: Array<{
    path?: string
    title?: string
    extractor?: string
  }>
  errors?: Array<{ src?: string; error?: string }>
  domain?: string
  rebuilt?: boolean
  partial?: "vault-kept"
  thread?: string
  url?: string
}

export function humanError(body: ApiErrorBody | null, status?: number): string {
  const msg = (body?.error || body?.errors?.[0]?.error || "").trim()
  if (msg) {
    if (/youtube.?transcript|not installed|ModuleNotFound/i.test(msg)) {
      return "YouTube ingest deps are missing. Restart with run.sh so .venv installs requirements.txt."
    }
    if (/anydoc|firecrawl-anydoc/i.test(msg)) {
      return "AnyDoc is missing from .venv. Restart with run.sh so requirements.txt installs firecrawl-anydoc."
    }
    if (/need url, path, or dump/i.test(msg)) {
      return "Cook needs a URL, a file path, or Cook dump."
    }
    if (/bb CLI is not on PATH|cook worker cannot nest/i.test(msg)) {
      return "Could not start a cook thread from this desk. Cook the draft from this chat instead."
    }
    if (/returned no thread id/i.test(msg)) {
      return "Cook worker started but returned no thread id. Check bb — the vault was not written here."
    }
    if (body?.partial === "vault-kept") {
      return vaultKeptToast(body)
    }
    if (/confirm required/i.test(msg)) {
      return "That write needs Confirm. Nothing was copied yet."
    }
    if (/css too large/i.test(msg)) {
      return "That stylesheet is too large to save."
    }
    if (/remote or data URLs/i.test(msg)) {
      return "Library CSS cannot pull remote or data URLs. Keep faces and images local."
    }
    if (/style closer/i.test(msg)) {
      return "That CSS contains a style closer, which would break the preview."
    }
    if (/does not look like the library CSS/i.test(msg)) {
      return "That does not look like the library CSS. Keep a body rule."
    }
    if (/scanned PDF needs OCR|FIRECRAWL_API_KEY unset/i.test(msg)) {
      return "That PDF is a scan. Hosted OCR stays off until FIRECRAWL_API_KEY is already in the desk .env."
    }
    if (/url must start with http|YouTube ingest needs an http/i.test(msg)) {
      return "Paste an http(s) URL. Local files go through Ingest, not Fetch."
    }
    if (/Chrome not found|dump-dom failed/i.test(msg)) {
      return "Dynamic scrape needs Chrome. Static Defuddle still works for ordinary HTML."
    }
    if (/not mounted|Kobo not mounted/i.test(msg)) {
      return "Kobo is not mounted. Plug it in, then dry-run again."
    }
    if (/too large|use \/api\/book\/spine/i.test(msg)) {
      return "This book is too large for a full download. Open it in spine mode instead."
    }
    if (looksLikeRawDump(msg)) {
      return "That step failed. Try again, or check the desk log."
    }
    return msg
  }
  if (status === 409) return "That action conflicts with the current device or book state."
  if (status === 404) return "Not found. Refresh the library and try again."
  if (status) return `Request failed (${status}).`
  return "Something went wrong."
}

function looksLikeRawDump(msg: string): boolean {
  if (msg.startsWith("{") || msg.startsWith("[")) return true
  if (msg.length > 160) return true
  if ((msg.match(/\n/g) || []).length > 1) return true
  if (/traceback|file ".+:\d+|yt-dlp|command not found/i.test(msg)) return true
  if (/\w+(Error|Exception):/.test(msg)) return true
  return false
}

export function humanExtractor(raw?: string): string {
  if (!raw) return ""
  const first = raw.split(" ")[0] || raw
  if (first.startsWith("chrome")) return "Chrome + Defuddle"
  if (first.startsWith("html-parser")) return "HTML fallback"
  const names: Record<string, string> = {
    defuddle: "Defuddle",
    talktobook: "TalkToBook",
    anydoc: "AnyDoc",
    "yt-dlp": "yt-dlp",
  }
  return names[first] || first
}

function vaultKeptToast(data: CookResult | ApiErrorBody): string {
  const title = data.title ? `${data.title} — ` : ""
  const domain = data.domain || "library"
  return `${title}in the ${domain} vault, but Hung Library rebuild failed.`
}

export function formatIngestResult(data: CookResult | ApiErrorBody | null): string {
  if (!data || typeof data !== "object") return "Done."
  const cook = data as CookResult
  if (cook.partial === "vault-kept") {
    return vaultKeptToast(cook)
  }
  if (data.ok === false) {
    const extra =
      cook.errors && cook.errors.length > 1
        ? ` (+${cook.errors.length - 1} more)`
        : ""
    return `${humanError(data)}${extra}`
  }
  if (cook.thread) {
    return `Cook thread started for ${cook.title || "this draft"}.`
  }
  if (cook.drafts?.length) {
    const n = cook.drafts.length
    const title = cook.drafts[0]?.title || cook.drafts[0]?.path?.split("/").pop()
    const via = humanExtractor(cook.drafts[0]?.extractor)
    const prefix = via ? `Draft ready via ${via}` : "Draft ready"
    if (n === 1) return `${prefix}: ${title}`
    return `${n} drafts ready (first: ${title})`
  }
  if (data.ok && data.path) {
    const name = String(data.path).split("/").pop()
    if (cook.domain && cook.rebuilt) {
      return `${cook.title ? `${cook.title} — ` : ""}in ${cook.domain} and Hung Library.`
    }
    if (cook.domain) {
      return `${cook.title ? `${cook.title} — ` : ""}in the ${cook.domain} vault. Hung Library not rebuilt.`
    }
    return `${data.title ? `${data.title} — ` : ""}saved ${name}`
  }
  if (data.error) return humanError(data)
  return "Done."
}

export const api = {
  library: () => fetch("/api/library").then((r) => parseJson<LibraryResponse>(r)),
  device: () => fetch("/api/device").then((r) => parseJson<DeviceStatus>(r)),
  inbox: () =>
    fetch("/api/inbox").then((r) => parseJson<{ items: InboxItem[] }>(r)),
  draft: (path: string) =>
    fetch(`/api/draft?path=${encodeURIComponent(path)}`).then((r) =>
      parseJson<{
        ok: boolean
        path?: string
        title?: string
        html?: string
        error?: string
      }>(r),
    ),
  epubStyle: async () => {
    const res = await fetch("/api/epub-style.css", { cache: "no-store" })
    if (!res.ok) return ""
    return res.text()
  },
  saveEpubStyle: (css: string) =>
    fetch("/api/epub-style.css", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ css, confirm: true }),
    }).then((r) => parseJson<ApiErrorBody & { bytes?: number }>(r)),
  discardDraft: (path: string) =>
    fetch("/api/inbox/discard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, confirm: true }),
    }).then((r) => parseJson<ApiErrorBody>(r)),
  spine: (path: string) =>
    fetch(`/api/book/spine?path=${encodeURIComponent(path)}`).then((r) =>
      parseJson<SpineManifest>(r),
    ),
  chapter: async (path: string, href: string) => {
    const res = await fetch(
      `/api/book/chapter?path=${encodeURIComponent(path)}&href=${encodeURIComponent(href)}`,
    )
    if (!res.ok) throw new Error(`Chapter failed (${res.status}).`)
    return res.text()
  },
  readStatePost: (body: Record<string, unknown>) =>
    fetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<{ book?: SpineManifest["read"] }>(r)),
  syncDryRun: (paths: string[]) =>
    fetch("/api/sync/dry-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    }).then((r) =>
      parseJson<{ device: DeviceStatus; plan: SyncPlanItem[] }>(r),
    ),
  syncRun: (paths: string[]) =>
    fetch("/api/sync/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths, confirm: true }),
    }).then((r) => parseJson<{ job: string; error?: string }>(r)),
  job: (id: string) =>
    fetch(`/api/jobs/${encodeURIComponent(id)}`).then((r) =>
      parseJson<JobSnapshot>(r),
    ),
  ingestTranscript: (text: string) =>
    fetch("/api/ingest/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, filename: "pasted-transcript.md" }),
    }).then((r) => parseJson<ApiErrorBody>(r)),
  cookToBook: (body: { path: string; domain: string; rebuild?: boolean }) =>
    fetch("/api/ingest/cook-to-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, confirm: true }),
    }).then((r) => parseJson<CookResult>(r)),
  sendAgent: (path: string, domain?: string) =>
    fetch("/api/ingest/send-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, domain, confirm: true }),
    }).then((r) => parseJson<CookResult>(r)),
  cook: (body: {
    url?: string
    path?: string
    dump?: boolean
    dynamic?: boolean
    promote?: boolean
    build?: boolean
    confirm?: boolean
    domain?: string
    category?: string
  }) =>
    fetch("/api/ingest/cook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson<CookResult>(r)),
  importEpub: (path: string, shelf: "books" | "generated") =>
    fetch("/api/ingest/import-epub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, shelf, confirm: true }),
    }).then((r) => parseJson<ApiErrorBody>(r)),
  makeBook: (body: {
    path: string
    title?: string
    cover?: string
    prompt?: string
    shelf?: "books" | "generated"
  }) =>
    fetch("/api/ingest/make-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, confirm: true }),
    }).then((r) => parseJson<ApiErrorBody>(r)),
  mediaProviders: () =>
    fetch("/api/media/providers").then((r) =>
      parseJson<{
        ok: boolean
        providers: Array<{
          id: string
          label: string
          available: boolean
          note?: string
        }>
      }>(r),
    ),
  buildEpub: () =>
    fetch("/api/build-epub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    }).then((r) => parseJson<ApiErrorBody>(r)),
}
