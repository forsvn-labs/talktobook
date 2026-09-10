// TalkToBook front-end. Plain JS. No build step.
const $ = (sel, root = document) => root.querySelector(sel);

let CONFIG = { contact_email: "" };

async function loadConfig() {
  try {
    CONFIG = await (await fetch("/api/config")).json();
    if (CONFIG.capabilities && CONFIG.capabilities.epub === false) {
      const form = document.getElementById("preview-form");
      const err = document.getElementById("preview-error");
      const btn = form && form.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      if (err) {
        err.textContent = "EPUB generation is temporarily unavailable on this machine.";
        err.hidden = false;
      }
    }
  } catch (_) { /* defaults are fine */ }
}

const previewForm = $("#preview-form");
if (previewForm) {
  previewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = $("#preview-error");
    if (err) err.hidden = true;
    const btn = form.querySelector("button[type=submit]");
    const label = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating EPUB…";
    }

    try {
      const sourceUrl = (form.source_url && form.source_url.value || "").trim();
      const fileInput = form.file;
      const hasFile = Boolean(fileInput && fileInput.files && fileInput.files.length);
      const hasTranscript = Boolean((form.transcript && form.transcript.value || "").trim());
      if (!sourceUrl && !hasFile && !hasTranscript) {
        throw new Error("Enter a YouTube URL or upload a transcript file.");
      }

      const fd = new FormData(form);
      fd.set("owns", form.owns && form.owns.checked ? "true" : "");
      if (!hasFile) fd.delete("file");
      if (!hasTranscript) fd.delete("transcript");

      const res = await fetch("/api/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Something went wrong.");
      renderResult(data);
    } catch (ex) {
      if (err) {
        err.textContent = ex.message || `Something went wrong. Try again, or email ${CONFIG.contact_email || "hello@talktobook.example"} if it keeps happening.`;
        err.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  });
}

function renderResult(job) {
  const title = $("#result-title");
  const meta = $("#result-meta");
  const dl = $("#download-preview");
  const prompt = $("#cover-prompt");
  const result = $("#result");
  if (title) title.textContent = job.title;
  const words = job.word_count ? `${job.word_count.toLocaleString()} words · ` : "";
  if (meta) meta.textContent = `${words}${job.author ? "by " + job.author : "ready to read"}`;
  if (dl && job.preview) dl.href = job.preview.epub;
  if (prompt) prompt.textContent = job.cover_prompt || "";
  if (result) {
    result.classList.remove("hidden");
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

loadConfig();
