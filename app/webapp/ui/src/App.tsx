import { useEffect, useState } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"
import { BookPage } from "@/components/book-page"
import { SampleDesk } from "@/components/sample-desk"
import { cn } from "@/lib/utils"
import {
  FALLBACK_PROOF,
  AFTER_PROOF,
  RAW_TRANSCRIPT,
  SAMPLE_META,
  mergeSamples,
} from "@/lib/edition"
import {
  api,
  type JobResult,
  type PreviewDoc,
  type PublicConfig,
  type SampleItem,
} from "@/lib/api"

type SourceMode = "youtube" | "file" | "paste"

const FAQ = [
  {
    q: "Does it read like a real book?",
    a: "Spoken prose stays spoken prose. The engine strips timestamps and merges fragments into paragraphs with proper typography. We won't invent structure your talk didn't have.",
  },
  {
    q: "Can I use any YouTube video?",
    a: "No. This is for content you own or have rights to. You confirm that before each build. It is a tool for creators repurposing their own work, not for ripping other people's.",
  },
  {
    q: "What if I only have audio?",
    a: "Transcribe it first, then paste or upload it. Built-in transcription is the next thing we're working on.",
  },
  {
    q: "What formats do I get?",
    a: "EPUB. PDF and Kindle (AZW3) build when WeasyPrint and Calibre are installed. Every edition is unofficial and credits the original creators.",
  },
]

const USE_CASES = [
  [
    "Lead magnet",
    "Put the best workshop notes behind an email form as a downloadable book.",
  ],
  [
    "Course companion",
    "Give students a lesson, cohort call, or expert interview they can annotate.",
  ],
  [
    "Webinar follow-up",
    "Send attendees a useful takeaway file instead of another replay link.",
  ],
  [
    "Newsletter bonus",
    "Package a private conversation or teaching session as a subscriber keeper.",
  ],
  [
    "Back-catalog",
    "Pull evergreen ideas out of old recordings and give them a longer shelf life.",
  ],
] as const

function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <a className="skip" href="#start">
        Skip to the converter
      </a>
      <header className="flex h-12 items-center justify-between border-b border-rule bg-paper px-4 md:px-6">
        <a href="/" className="wordmark font-display text-lg font-semibold no-underline">
          TalkToBook
        </a>
        <nav className="flex items-center gap-4 text-sm">
          <a href="#start" className="shrink-0 text-ink no-underline hover:text-oxblood-2">
            Generate<span className="max-sm:hidden"> EPUB</span>
          </a>
        </nav>
      </header>
      {children}
      <footer className="border-t border-rule px-4 py-12 md:px-8">
        <p className="wordmark font-display text-2xl">TalkToBook</p>
        <p className="mt-4 max-w-xl text-sm text-ink-2">
          Only turn content you own into a book people can keep. Every edition is
          unofficial. The original creators are credited by name.
        </p>
        <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
          <a href="/terms">Terms &amp; Acceptable Use</a>
          <a href="/terms#dmca">Copyright / DMCA</a>
        </nav>
        <p className="mt-4 max-w-xl text-xs text-muted-foreground">
          talktobook.com is not ours. This app runs locally. Markdown editions
          for crawlers live at /product.md and /faq.md.
        </p>
      </footer>
    </div>
  )
}

function TermsPage({ config }: { config: PublicConfig | null }) {
  const contact = config?.contact_email || "hello@talktobook.example"
  const dmca = config?.dmca_email || "dmca@talktobook.example"
  return (
    <SiteChrome>
      <main id="start" className="mx-auto max-w-2xl px-4 py-12 md:px-8">
        <h1 className="text-4xl leading-tight">Terms &amp; Acceptable Use.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 2026</p>
        <div className="mt-3 h-px w-8 bg-oxblood" aria-hidden="true" />
        <Alert className="mt-8">
          <AlertTitle>Not legal advice</AlertTitle>
          <AlertDescription>
            Plain-language starting template. Have a qualified IP lawyer review
            it before you rely on it.
          </AlertDescription>
        </Alert>
        <div className="mt-8 space-y-6 text-base leading-relaxed text-ink-2">
          <h2 className="text-2xl text-ink">1. What TalkToBook is</h2>
          <p>
            TalkToBook is a tool that reformats a transcript you supply into a
            designed ebook. We are not a content library or publisher.
          </p>
          <h2 className="text-2xl text-ink">2. You must own or have rights</h2>
          <p>
            By generating a book, you represent that you own the content, or
            have all rights necessary to convert and distribute it. You confirm
            this with the ownership checkbox before each conversion.
          </p>
          <h2 className="text-2xl text-ink">3. Acceptable use</h2>
          <p>
            Your own recordings, licensed material, or public-domain work. Do
            not upload other creators&apos; videos, talks, or books.
          </p>
          <h2 id="dmca" className="text-2xl text-ink">
            5. Copyright complaints
          </h2>
          <p>
            Send a notice to <a href={`mailto:${dmca}`}>{dmca}</a>. We act on
            valid notices.
          </p>
          <h2 className="text-2xl text-ink">7. Contact</h2>
          <p>
            Questions go to <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        </div>
      </main>
    </SiteChrome>
  )
}

function CapabilityLine({ config }: { config: PublicConfig | null }) {
  const caps = config?.capabilities
  if (!caps) return null
  const items = (
    [
      ["epub", "EPUB"],
      ["pdf", "PDF"],
      ["azw3", "Kindle"],
      ["youtube", "YouTube"],
    ] as const
  ).map(([key, label]) => (
    <span key={key} className={caps[key] ? "text-oxblood" : "text-muted-foreground"}>
      {label} {caps[key] ? "ready" : "off"}
    </span>
  ))
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs tracking-wide">
      {items}
    </p>
  )
}

function HomePage({ config }: { config: PublicConfig | null }) {
  const [mode, setMode] = useState<SourceMode>("youtube")
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [transcript, setTranscript] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [owns, setOwns] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<JobResult | null>(null)
  const [reading, setReading] = useState<PreviewDoc>(FALLBACK_PROOF)
  const [samples, setSamples] = useState<SampleItem[]>(SAMPLE_META)

  const caps = config?.capabilities
  const epubReady = caps?.epub !== false

  useEffect(() => {
    void api
      .samples()
      .then((data) => setSamples(mergeSamples(data.samples || [])))
      .catch(() => setSamples(SAMPLE_META))
    void api
      .samplePreview("the-quiet-tool")
      .then(setReading)
      .catch(() => setReading(FALLBACK_PROOF))
  }, [])

  const submit = async () => {
    setError(null)
    if (!owns) {
      setError("Confirm you own or have rights to this content.")
      return
    }
    if (mode === "youtube" && !url.trim()) {
      setError("Enter a YouTube URL or switch to a transcript.")
      return
    }
    if (mode === "file" && !file) {
      setError("Choose a .txt, .md, .srt, or .vtt file.")
      return
    }
    if (mode === "paste" && !transcript.trim()) {
      setError("Paste a transcript, or use a YouTube URL.")
      return
    }
    if (!epubReady) {
      setError("EPUB generation is unavailable on this machine (pandoc missing).")
      return
    }

    const fd = new FormData()
    fd.set("owns", "true")
    if (title.trim()) fd.set("title", title.trim())
    if (mode === "youtube") fd.set("source_url", url.trim())
    if (mode === "paste") fd.set("transcript", transcript)
    if (mode === "file" && file) fd.set("file", file)

    setBusy(true)
    setStatus("generating")
    try {
      const created = await api.preview(fd)
      setStatus("checking")
      const polled = await api.job(created.job_id).catch(() => created)
      setJob(polled)
      setStatus(polled.status || "ready")
      const preview = await api.jobPreview(created.job_id).catch(() => null)
      if (preview) setReading(preview)
      toast.success("Unofficial reading edition is ready.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not build the book."
      setError(msg)
      setStatus("error")
      toast.error(msg)
    }
    setBusy(false)
  }

  const openSample = async (slug: string) => {
    try {
      const doc = await api.samplePreview(slug)
      setReading(doc)
      setJob(null)
      setStatus("sample")
      document.getElementById("proof")?.scrollIntoView({ behavior: "smooth", block: "start" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open sample.")
    }
  }

  return (
    <SiteChrome>
      <section className="grid min-h-[calc(100dvh-3rem)] lg:grid-cols-[minmax(20rem,24.5rem)_minmax(0,1fr)]">
        <aside
          id="start"
          className="flex flex-col border-b border-rule bg-panel px-4 py-6 md:px-6 lg:border-r lg:border-b-0"
        >
          <h1 className="max-w-[11ch] text-[2.15rem] leading-[1.05] md:text-[2.45rem]">
            Make a book from the talk.
          </h1>
          <p className="mt-3 max-w-[36ch] text-sm leading-relaxed text-ink-2">
            Paste a URL you own. The page on the desk is the edition — set in
            type, unofficial, attributed.
          </p>
          <div className="mt-4">
            <CapabilityLine config={config} />
          </div>

          <div className="mt-6 flex items-baseline justify-between gap-3 border-b border-rule pb-2">
            <h2 className="font-sans text-base font-semibold tracking-tight">
              Make an EPUB
            </h2>
            <span className="text-xs text-muted-foreground">No account</span>
          </div>

          <div role="tablist" className="mt-4 flex gap-4 border-b border-rule">
            {(
              [
                ["youtube", "YouTube"],
                ["file", "Upload"],
                ["paste", "Paste"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                className={cn(
                  "-mb-px h-9 border-b-2 bg-transparent px-0 text-sm",
                  mode === id
                    ? "border-oxblood font-medium text-ink"
                    : "border-transparent text-muted-foreground",
                )}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <FieldGroup className="mt-4">
            {mode === "youtube" && (
              <Field>
                <FieldLabel htmlFor="source-url">YouTube URL</FieldLabel>
                <Input
                  id="source-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://youtu.be/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={busy || caps?.youtube === false}
                />
              </Field>
            )}
            {mode === "file" && (
              <Field>
                <FieldLabel htmlFor="transcript-file">Transcript file</FieldLabel>
                <Input
                  id="transcript-file"
                  type="file"
                  accept=".txt,.md,.markdown,.srt,.vtt"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={busy}
                />
              </Field>
            )}
            {mode === "paste" && (
              <Field>
                <FieldLabel htmlFor="transcript-text">Transcript</FieldLabel>
                <Textarea
                  id="transcript-text"
                  rows={6}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste a timestamped transcript…"
                  disabled={busy}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="book-title">
                Book title{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                id="book-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Launch Webinar Notes"
                disabled={busy}
              />
            </Field>
          </FieldGroup>

          <div className="mt-4 flex items-start gap-2">
            <Checkbox
              id="owns"
              checked={owns}
              onCheckedChange={(v) => setOwns(v === true)}
              disabled={busy}
            />
            <Label htmlFor="owns">
              <span>
                I own or have the rights to this content, and I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener">
                  Terms
                </a>
                .
              </span>
            </Label>
          </div>

          {!epubReady && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>EPUB unavailable</AlertTitle>
              <AlertDescription>
                pandoc is not on this machine. Install it, then retry.
              </AlertDescription>
            </Alert>
          )}
          {caps?.youtube === false && mode === "youtube" && (
            <Alert className="mt-4">
              <AlertTitle>YouTube fetch is off</AlertTitle>
              <AlertDescription>
                youtube-transcript-api is missing. Upload or paste a transcript
                instead.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Could not build</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="button"
            className="mt-5 w-full"
            disabled={busy || !epubReady}
            onClick={() => void submit()}
          >
            {busy ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : null}
            {busy ? "Generating EPUB…" : "Generate EPUB"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Job status: {status}
            {job?.job_id ? ` · ${job.job_id}` : ""}
          </p>
        </aside>

        <div
          id="proof"
          className="book-stage flex min-h-[32rem] flex-col scroll-mt-12"
        >
          {job && (
            <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-panel px-4 py-3 md:px-8">
              <div className="min-w-0 flex-1">
                <p className="text-xs tracking-wide text-oxblood uppercase">
                  {job.status} · unofficial
                </p>
                <p className="font-display truncate text-lg leading-tight">
                  {job.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {job.word_count
                    ? `${job.word_count.toLocaleString()} words`
                    : "Ready"}
                  {job.author ? ` · ${job.author}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.downloads.epub && (
                  <Button asChild>
                    <a href={job.downloads.epub} download>
                      Download EPUB
                    </a>
                  </Button>
                )}
                {job.downloads.pdf && (
                  <Button variant="outline" asChild>
                    <a href={job.downloads.pdf} download>
                      PDF
                    </a>
                  </Button>
                )}
                {job.downloads.azw3 && (
                  <Button variant="outline" asChild>
                    <a href={job.downloads.azw3} download>
                      Kindle
                    </a>
                  </Button>
                )}
              </div>
              {job.cover_prompt && (
                <details className="w-full">
                  <summary className="cursor-pointer text-sm font-medium">
                    Cover prompt
                  </summary>
                  <pre className="mt-2 overflow-auto bg-paper p-3 font-mono text-xs whitespace-pre-wrap">
                    {job.cover_prompt}
                  </pre>
                </details>
              )}
            </div>
          )}
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-4 py-8 md:px-10 md:py-10">
            <BookPage doc={reading} folio={job ? "edition" : "sample"} />
          </div>
        </div>
      </section>

      <section id="samples" className="desk-samples border-t border-rule px-4 py-14 md:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl leading-tight">Sample editions</h2>
          <div className="mt-3 h-px w-8 bg-oxblood" aria-hidden="true" />
          <p className="mt-3 max-w-2xl text-ink-2">
            Original demo pages, not third-party talks. Open one on the desk,
            then download the EPUB when this machine can build it.
          </p>
          <div className="mt-8">
            <SampleDesk samples={samples} onOpen={(slug) => void openSample(slug)} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <h2 className="text-3xl leading-tight">
          How creators put one recording to work.
        </h2>
        <div className="mt-3 h-px w-8 bg-oxblood" aria-hidden="true" />
        <ul className="mt-8 divide-y divide-rule border-y border-rule">
          {USE_CASES.map(([name, copy]) => (
            <li
              key={name}
              className="grid gap-2 py-5 md:grid-cols-[14rem_minmax(0,1fr)] md:items-baseline"
            >
              <h3 className="font-display text-xl leading-tight">{name}</h3>
              <p className="text-ink-2">{copy}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-rule bg-paper-2 px-4 py-14 md:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl leading-tight">
            From transcript dump to clean page.
          </h2>
          <div className="mt-3 h-px w-8 bg-oxblood" aria-hidden="true" />
          <p className="mt-3 max-w-2xl text-ink-2">
            The engine strips timestamps, merges fragments into paragraphs, and
            sets interviewer turns apart. It does not rewrite your ideas.
          </p>
          <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
            <figure>
              <figcaption className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Before, raw transcript
              </figcaption>
              <pre className="transcript-dump">{RAW_TRANSCRIPT}</pre>
            </figure>
            <figure>
              <figcaption className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                After, designed page
              </figcaption>
              <BookPage doc={AFTER_PROOF} folio="i" />
            </figure>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 py-14 md:px-8">
        <h2 className="text-3xl leading-tight">Questions.</h2>
        <div className="mt-3 h-px w-8 bg-oxblood" aria-hidden="true" />
        <div className="mt-8 divide-y divide-rule border-y border-rule">
          {FAQ.map((item) => (
            <details key={item.q} className="py-3">
              <summary className="cursor-pointer font-medium">{item.q}</summary>
              <p className="mt-2 text-sm text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </SiteChrome>
  )
}

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const terms = window.location.pathname.startsWith("/terms")

  useEffect(() => {
    void api.config().then(setConfig).catch(() => setConfig(null))
  }, [])

  return (
    <>
      {terms ? <TermsPage config={config} /> : <HomePage config={config} />}
      <Toaster position="bottom-right" />
    </>
  )
}
