import { marked } from "marked";
import hljs from "highlight.js";
import katex from "katex";

// Configure marked with highlight.js renderer + LaTeX placeholder support
marked.use({
  renderer: (() => {
    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      const highlighted = hljs.highlight(text, { language }).value;
      return `
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">${language}</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(text)}'))">Copy</button>
          </div>
          <pre><code class="hljs language-${language}">${highlighted}</code></pre>
        </div>
      `;
    };
    return renderer;
  })(),
  breaks: true,
  gfm: true,
});

export function renderWithLatex(text: string): string {
  if (!text) return "";

  // Step 1: protect LaTeX blocks from markdown parser
  const latexBlocks: string[] = [];
  text = text.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
    latexBlocks.push(`$$${math}$$`);
    return `LATEXBLOCK${latexBlocks.length - 1}`;
  });
  text = text.replace(/\$([^$\n]+)\$/g, (_, math) => {
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

  return rendered;
}

