import { marked } from "marked";
import hljs from "highlight.js";
import katex from "katex";
import DOMPurify from "dompurify";

// Everything rendered here ends up in dangerouslySetInnerHTML. The input is
// LLM output (which can be steered by uploaded documents) or user text, so
// the final HTML is always sanitized: no scripts, no event handlers.

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Configure marked with highlight.js renderer + LaTeX placeholder support
marked.use({
  renderer: (() => {
    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      const highlighted = hljs.highlight(text, { language }).value;
      // The copy handler is attached once below via event delegation, so the
      // code never has to be embedded in an inline script.
      return `
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">${escapeAttr(language)}</span>
            <button type="button" class="copy-btn" data-code="${escapeAttr(encodeURIComponent(text))}">Copy</button>
          </div>
          <pre><code class="hljs language-${escapeAttr(language)}">${highlighted}</code></pre>
        </div>
      `;
    };
    return renderer;
  })(),
  breaks: true,
  gfm: true,
});

let browserSetupDone = false;

function setupBrowser(): void {
  if (browserSetupDone) return;
  browserSetupDone = true;

  // Open rendered links in a new tab without giving it access to this window.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.("button.copy-btn") as HTMLButtonElement | null;
    if (!button) return;
    const code = decodeURIComponent(button.dataset.code ?? "");
    navigator.clipboard?.writeText(code).then(() => {
      const label = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = label; }, 1200);
    }).catch(() => {});
  });
}

export function renderWithLatex(text: string): string {
  if (!text) return "";
  // DOMPurify needs a DOM. All callers render fetched content on the client,
  // so the server-rendered HTML for these blocks is empty anyway.
  if (typeof window === "undefined" || !DOMPurify.isSupported) return "";
  setupBrowser();

  // Step 1: protect LaTeX blocks from markdown parser
  const latexBlocks: string[] = [];
  text = text.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
    latexBlocks.push(`$$${math}$$`);
    return `LATEXBLOCK${latexBlocks.length - 1}`;
  });
  // Inline math: no space just inside the $...$ and no digit right after the
  // closing $, so prices like "$5 and $10" stay as text.
  text = text.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_, math) => {
    latexBlocks.push(`$${math}$`);
    return `LATEXINLINE${latexBlocks.length - 1}`;
  });

  // Step 2: render markdown (with syntax-highlighted code blocks)
  let rendered = marked.parse(text) as string;

  // Step 3: restore and render LaTeX
  rendered = rendered.replace(/LATEXBLOCK(\d+)/g, (_, i) => {
    const math = latexBlocks[parseInt(i)].slice(2, -2);
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch { return latexBlocks[parseInt(i)]; }
  });
  rendered = rendered.replace(/LATEXINLINE(\d+)/g, (_, i) => {
    const math = latexBlocks[parseInt(i)].slice(1, -1);
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch { return latexBlocks[parseInt(i)]; }
  });

  // Step 4: strip anything executable (scripts, on* handlers, javascript: URLs).
  return DOMPurify.sanitize(rendered, { ADD_ATTR: ["target"] });
}
