export type Capabilities = {
  epub: boolean
  pdf: boolean
  azw3: boolean
  cover: boolean
  youtube: boolean
}

export type PublicConfig = {
  app_name: string
  capabilities: Capabilities
  contact_email: string
  dmca_email: string
  allowed_exts: string[]
  max_upload_bytes: number
  unofficial: boolean
}

export type JobResult = {
  job_id: string
  title: string
  author: string | null
  word_count: number
  cover_prompt: string
  preview: Record<string, string>
  downloads: Record<string, string>
  status: string
  formats: string[]
  unofficial: boolean
  preview_text: string
}

export type SampleItem = {
  slug: string
  title: string
  author: string
  kind: string
  blurb: string
  unofficial?: boolean
  preview: string
  epub?: string
  cover?: string | null
  pdf?: string | null
}

export type PreviewDoc = {
  title: string
  author: string | null
  markdown: string
  unofficial: boolean
  word_count?: number
}

function errorDetail(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object") {
    const msg = (detail[0] as { msg?: string }).msg
    if (msg) return msg
  }
  return fallback
}

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(errorDetail(data, fallback))
  return data as T
}

export const api = {
  config: () => fetch("/api/config").then((r) => readJson<PublicConfig>(r, "Could not load config.")),
  samples: () =>
    fetch("/api/samples").then((r) =>
      readJson<{ samples: SampleItem[] }>(r, "Could not load sample editions."),
    ),
  samplePreview: (slug: string) =>
    fetch(`/api/samples/${encodeURIComponent(slug)}/preview`).then((r) =>
      readJson<PreviewDoc>(r, "Could not load that sample."),
    ),
  job: (id: string) =>
    fetch(`/api/job/${encodeURIComponent(id)}`).then((r) =>
      readJson<JobResult>(r, "Unknown job."),
    ),
  jobPreview: (id: string) =>
    fetch(`/api/job/${encodeURIComponent(id)}/preview`).then((r) =>
      readJson<PreviewDoc>(r, "Preview is not ready."),
    ),
  preview: (body: FormData) =>
    fetch("/api/preview", { method: "POST", body }).then((r) =>
      readJson<JobResult>(r, "Could not build the book."),
    ),
}
