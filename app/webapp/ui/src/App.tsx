import { useEffect, useMemo, useState } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
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

function MarkdownPage({ doc }: { doc: PreviewDoc }) {
  const blocks = useMemo(() => {
    return doc.markdown
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
  }, [doc.markdown])

  return (
    <article className="mx-auto max-w-prose font-display text-lg leading-relaxed text-foreground">
      <p className="mb-4 font-sans text-xs tracking-wide text-muted-foreground uppercase">
        Unofficial reading edition · credits the original creators · claims no
        copyright over the source
      </p>
      {blocks.map((block, i) => {
        if (block.startsWith("# ")) {
          return (
            <h3 key={i} className="mt-2 mb-3 text-3xl leading-tight">
              {block.replace(/^#\s+/, "")}
            </h3>
          )
        }
        if (block.startsWith("*by ") || block.startsWith("*by")) {
          return (
            <p key={i} className="mb-4 font-sans text-sm text-muted-foreground">
              {block.replace(/^\*|\*$/g, "")}
            </p>
          )
        }
        if (block.startsWith(">")) {
          return (
            <blockquote
              key={i}
              className="my-4 border-l-2 border-ring pl-4 text-muted-foreground"
            >
              {block.replace(/^>\s?/gm, "")}
            </blockquote>
          )
        }
        return (
          <p key={i} className="mb-4 whitespace-pre-wrap">
            {block}
          </p>
        )
      })}
    </article>
  )
}

function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <a className="skip" href="#start">
        Skip to the converter
      </a>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:px-8">
        <a href="/" className="font-display text-lg font-semibold text-foreground no-underline">
          TalkToBook
        </a>
        <nav className="flex items-center gap-3 text-sm">
          <a href="#start" className="text-foreground no-underline">
            Generate EPUB
          </a>
        </nav>
      </header>
      {children}
      <footer className="border-t border-border px-4 py-10 md:px-8">
        <p className="font-display text-xl">TalkToBook</p>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Only turn content you own into a book people can keep. Every edition is
          unofficial. The original creators are credited by name.
        </p>
        <nav className="mt-4 flex flex-wrap gap-4 text-sm">
          <a href="/terms">Terms &amp; Acceptable Use</a>
          <a href="/terms#dmca">Copyright / DMCA</a>
        </nav>
      </footer>
    </div>
  )
}

function TermsPage({ config }: { config: PublicConfig | null }) {
  const contact = config?.contact_email || "hello@talktobook.example"
  const dmca = config?.dmca_email || "dmca@talktobook.example"
  return (
    <SiteChrome>
      <main id="start" className="mx-auto max-w-3xl px-4 py-12 md:px-8">
        <h1 className="text-4xl">Terms &amp; Acceptable Use.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 2026</p>
        <Alert className="mt-6">
          <AlertTitle>Not legal advice</AlertTitle>
          <AlertDescription>
            Plain-language starting template. Have a qualified IP lawyer review
            it before you rely on it.
          </AlertDescription>
        </Alert>
        <div className="mt-8 space-y-6 text-base leading-relaxed">
          <h2 className="text-2xl">1. What TalkToBook is</h2>
          <p>
            TalkToBook is a tool that reformats a transcript you supply into a
            designed ebook. We are not a content library or publisher.
          </p>
          <h2 className="text-2xl">2. You must own or have rights</h2>
          <p>
            By generating a book, you represent that you own the content, or
            have all rights necessary to convert and distribute it. You confirm
            this with the ownership checkbox before each conversion.
          </p>
          <h2 className="text-2xl">3. Acceptable use</h2>
          <p>
            Your own recordings, licensed material, or public-domain work. Do
            not upload other creators&apos; videos, talks, or books.
          </p>
          <h2 id="dmca" className="text-2xl">
            5. Copyright complaints
          </h2>
          <p>
            Send a notice to{" "}
            <a href={`mailto:${dmca}`}>{dmca}</a>. We act on valid notices.
          </p>
          <h2 className="text-2xl">7. Contact</h2>
          <p>
            Questions go to <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        </div>
      </main>
    </SiteChrome>
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
  const [reading, setReading] = useState<PreviewDoc | null>(null)
  const [samples, setSamples] = useState<SampleItem[]>([])

  const caps = config?.capabilities
  const epubReady = caps?.epub !== false

  useEffect(() => {
    void api
      .samples()
      .then((data) => setSamples(data.samples || []))
      .catch(() => setSamples([]))
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
      setReading(preview)
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
      document.getElementById("result")?.scrollIntoView({ behavior: "smooth" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open sample.")
    }
  }

  return (
    <SiteChrome>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-2 md:px-8 md:py-16">
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl leading-tight md:text-5xl">
            Turn a YouTube URL into a reading edition.
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">
            One talk, webinar, episode, or lesson becomes a book your audience
            can keep. Unofficial. Attributed. Local.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {caps &&
              (["epub", "pdf", "azw3", "youtube"] as const).map((key) => (
                <Badge key={key} variant={caps[key] ? "outline" : "secondary"}>
                  {key.toUpperCase()} {caps[key] ? "ready" : "off"}
                </Badge>
              ))}
          </div>
        </div>

        <Card id="start">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Make an EPUB</CardTitle>
              <Badge variant="outline">No account</Badge>
            </div>
            <CardDescription>
              Paste a captioned YouTube video you own, or upload a transcript.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
            <div role="tablist" className="flex gap-1 rounded-lg bg-secondary p-1">
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
                    "h-8 flex-1 rounded-md text-sm",
                    mode === id
                      ? "bg-card text-foreground"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <FieldGroup>
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
                    rows={8}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Paste a timestamped transcript…"
                    disabled={busy}
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="book-title">
                  Book title <span className="font-normal text-muted-foreground">(optional)</span>
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

            <div className="flex items-start gap-2">
              <Checkbox
                id="owns"
                checked={owns}
                onCheckedChange={(v) => setOwns(v === true)}
                disabled={busy}
              />
              <Label htmlFor="owns">
                I own or have the rights to this content, and I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener">
                  Terms
                </a>
                .
              </Label>
            </div>

            {!epubReady && (
              <Alert variant="destructive">
                <AlertTitle>EPUB unavailable</AlertTitle>
                <AlertDescription>
                  pandoc is not on this machine. Install it, then retry.
                </AlertDescription>
              </Alert>
            )}
            {caps?.youtube === false && mode === "youtube" && (
              <Alert>
                <AlertTitle>YouTube fetch is off</AlertTitle>
                <AlertDescription>
                  youtube-transcript-api is missing. Upload or paste a
                  transcript instead.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Could not build</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              className="w-full"
              disabled={busy || !epubReady}
              onClick={() => void submit()}
            >
              {busy ? (
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
              ) : null}
              {busy ? "Generating EPUB…" : "Generate EPUB"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Job status: {status}
              {job?.job_id ? ` · ${job.job_id}` : ""}
            </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="result" className="mx-auto max-w-6xl px-4 pb-12 md:px-8">
        {job && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge variant="outline">{job.status}</Badge>
                  <CardTitle className="mt-2">
                    {job.title}
                  </CardTitle>
                  <CardDescription>
                    {job.word_count
                      ? `${job.word_count.toLocaleString()} words`
                      : "Ready"}
                    {job.author ? ` · by ${job.author}` : ""}
                    {" · unofficial edition"}
                  </CardDescription>
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
              </div>
            </CardHeader>
            {job.cover_prompt && (
              <CardContent>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Cover prompt
                  </summary>
                  <pre className="mt-2 overflow-auto rounded-md bg-secondary p-3 font-mono text-xs whitespace-pre-wrap">
                    {job.cover_prompt}
                  </pre>
                </details>
              </CardContent>
            )}
          </Card>
        )}
        {reading && (
          <div className="rounded-xl border border-border bg-card px-5 py-8 md:px-10">
            <MarkdownPage doc={reading} />
          </div>
        )}
      </section>

      <section className="bg-secondary/60 px-4 py-14 md:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl">Sample editions</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Original demo pages, not third-party talks. Read the page, then
            download the EPUB when this machine can build it.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {samples.map((s) => (
              <Card key={s.slug}>
                <CardHeader>
                  <Badge variant="outline">{s.kind}</Badge>
                  <CardTitle>{s.title}</CardTitle>
                  <CardDescription>
                    {s.author} · unofficial
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <p className="text-sm">{s.blurb}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void openSample(s.slug)}
                      >
                        Read
                      </Button>
                      {s.epub && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={s.epub} download>
                            EPUB
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <h2 className="text-3xl">How creators put one recording to work.</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Lead magnet", "Put the best workshop notes behind an email form as a downloadable book."],
            ["Course companion", "Give students a lesson, cohort call, or expert interview they can annotate."],
            ["Webinar follow-up", "Send attendees a useful takeaway file instead of another replay link."],
            ["Newsletter bonus", "Package a private conversation or teaching session as a subscriber keeper."],
          ].map(([title, copy]) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{copy}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 md:px-8">
        <h2 className="text-3xl">Questions.</h2>
        <div className="mt-6 flex flex-col gap-2">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="rounded-lg border border-border bg-card px-4 py-3"
            >
              <summary className="cursor-pointer font-medium">{item.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
        <Separator className="my-8" />
        <p className="text-sm text-muted-foreground">
          talktobook.com is not ours. This app runs locally. Markdown editions
          for crawlers live at /product.md and /faq.md.
        </p>
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
