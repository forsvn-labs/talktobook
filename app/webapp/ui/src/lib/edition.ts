import type { PreviewDoc, SampleItem } from "@/lib/api"

export const SAMPLE_META: SampleItem[] = [
  {
    slug: "the-quiet-tool",
    title: "The Quiet Tool",
    author: "Ada & Grace",
    kind: "Interview",
    blurb: "Two builders on why the best tools disappear into the work.",
    unofficial: true,
    preview: "/api/samples/the-quiet-tool/preview",
  },
  {
    slug: "on-finishing",
    title: "On Finishing",
    author: "Marin Vale",
    kind: "Solo talk",
    blurb: "A short talk on shipping the work instead of polishing it forever.",
    unofficial: true,
    preview: "/api/samples/on-finishing/preview",
  },
  {
    slug: "notes-from-a-long-walk",
    title: "Notes from a Long Walk",
    author: "Devi Rao & Tomas Lind",
    kind: "Interview",
    blurb: "A conversation on walking, attention, and where ideas come from.",
    unofficial: true,
    preview: "/api/samples/notes-from-a-long-walk/preview",
  },
]

export const FALLBACK_PROOF: PreviewDoc = {
  title: "The Quiet Tool",
  author: "Ada & Grace",
  unofficial: true,
  markdown: [
    "# The Quiet Tool",
    "",
    "An unofficial reading edition of a conversation by Ada & Grace.",
    "",
    "Ada: Welcome back. Today we're talking about a strange idea — that the best tools are the ones you stop noticing. Think about a good kitchen knife, or a pencil. You don't admire it while you use it. You just reach for it and the work happens.",
    "",
    "Grace: Right. A tool earns trust by being boring in the best way. It does the same thing every single time. When it surprises you, that's usually a bug, not a feature.",
    "",
    "Ada: So the goal is predictability, not cleverness.",
    "",
    "Grace: Predictability first. Then, once you trust it, you can build cleverness on top of it. But the order matters. People get that backwards all the time — they reach for the clever thing before the reliable thing exists.",
    "",
    "Ada: I think there's a cost to attention, too. Every time a tool asks you to look at it — a popup, a setting, a little animation — it's taking something from the work.",
    "",
    "Grace: Exactly. Attention is the budget. A loud tool spends your budget on itself. A quiet tool spends it on what you're actually making.",
  ].join("\n"),
}

export const AFTER_PROOF: PreviewDoc = {
  title: "The Quiet Tool",
  author: "Ada & Grace",
  unofficial: true,
  markdown: [
    "# The Quiet Tool",
    "",
    "An unofficial reading edition of a conversation by Ada & Grace.",
    "",
    "Ada: Welcome back. Today we're talking about how good tools quietly disappear into the work. The best ones never ask for attention. You just reach for them.",
    "",
    "Grace: Right. A tool earns trust by being boring in the best way.",
  ].join("\n"),
}

export const RAW_TRANSCRIPT = [
  "**00:00:00**: >> Ada: Welcome back. Today we're",
  "talking about how good tools quietly",
  "disappear into the work.",
  "**00:00:08**: >> Ada: The best ones never ask",
  "for attention. You just reach for them.",
  "**00:00:15**: >> Grace: Right. A tool earns trust",
  "by being boring in the best way.",
].join("\n")

export type EditionBlock =
  | { type: "title"; text: string }
  | { type: "byline"; text: string }
  | { type: "quote"; text: string }
  | { type: "speaker"; name: string; text: string; named: boolean }
  | { type: "paragraph"; text: string }

const SKIP_COMMENTS = new Set([
  "<!-- t2e:attribution:start -->",
  "<!-- t2e:attribution:end -->",
])

export function editionBlocks(markdown: string): EditionBlock[] {
  const chunks = markdown
    .split(/\n{2,}/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !SKIP_COMMENTS.has(line.trim()))
        .join("\n")
        .trim(),
    )
    .filter(Boolean)

  const out: EditionBlock[] = []
  let lastSpeaker = ""
  for (const block of chunks) {
    if (block.startsWith("# ")) {
      lastSpeaker = ""
      out.push({ type: "title", text: block.replace(/^#\s+/, "") })
      continue
    }
    if (/^an unofficial reading edition/i.test(block)) {
      lastSpeaker = ""
      out.push({ type: "byline", text: block.replace(/\.$/, "") })
      continue
    }
    if (/^\*by\s/i.test(block)) {
      lastSpeaker = ""
      out.push({ type: "byline", text: block.replace(/^\*|\*$/g, "") })
      continue
    }
    if (block.startsWith("Original source:")) continue
    if (block.startsWith(">")) {
      lastSpeaker = ""
      const quote = block.replace(/^>\s?/gm, "")
      if (/claims no copyright/i.test(quote)) continue
      out.push({ type: "quote", text: quote })
      continue
    }
    const speaker = block.match(
      /^([A-Z][A-Za-z][A-Za-z .'-]{0,32}):\s+([\s\S]+)/,
    )
    if (speaker) {
      const name = speaker[1]
      out.push({
        type: "speaker",
        name,
        text: speaker[2],
        named: name !== lastSpeaker,
      })
      lastSpeaker = name
      continue
    }
    lastSpeaker = ""
    out.push({ type: "paragraph", text: block })
  }
  return out
}

export function mergeSamples(remote: SampleItem[]): SampleItem[] {
  const bySlug = new Map(remote.map((item) => [item.slug, item]))
  return SAMPLE_META.map((local) => ({ ...local, ...bySlug.get(local.slug) }))
}
