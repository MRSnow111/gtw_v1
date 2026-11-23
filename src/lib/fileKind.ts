/**
 * Определение типа файла для просмотрщика артефактов (фаза 2, фича C).
 *kind выбирается по MIME и расширению; lang — для подсветки кода.
 * Порядок важен: image/pdf/office/markdown раньше кода.
 */

export type FileKind = "code" | "image" | "pdf" | "office" | "markdown" | "other";

const OFFICE_EXT = new Set([
  "doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "ods", "odp", "rtf",
]);

const OFFICE_MIME_PREFIX = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-",
  "application/vnd.oasis.opendocument",
  "application/rtf",
  "application/x-rtf",
];

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"]);

const CODE_EXT_LANG: Record<string, string> = {
  py: "python", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", json: "json", css: "css", scss: "css", less: "css",
  html: "html", htm: "html", xml: "xml", svg: "xml", yml: "yaml", yaml: "yaml",
  sh: "bash", bash: "bash", zsh: "bash", sql: "sql", go: "go", rs: "rust", java: "java",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", rb: "ruby", php: "php",
  swift: "swift", kt: "kotlin", kts: "kotlin", toml: "toml", ini: "ini", cfg: "ini",
  conf: "ini", log: "text", txt: "text", csv: "text", tsv: "text", md: "markdown",
  markdown: "markdown", mdx: "markdown", vue: "html", svelte: "html", lua: "lua", r: "r",
  pl: "perl", ps1: "powershell", bat: "batch", graphql: "graphql", proto: "proto",
};

const CODE_MIME = new Set([
  "application/json", "application/javascript", "application/typescript", "application/xml",
  "application/x-yaml", "application/yaml", "application/x-sh", "application/sql",
  "application/toml", "application/x-python", "application/x-httpd-php", "application/graphql",
  "application/x-perl", "application/x-ruby",
]);

const SPECIAL_CODE_NAMES = new Set(["dockerfile", "makefile", "gemfile", "rakefile", "procfile"]);

export function extOf(name: string): string {
  const base = (name || "").split("/").pop() || "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function detectKind(name: string, mime: string): { kind: FileKind; lang: string } {
  const m = (mime || "").toLowerCase();
  const ext = extOf(name);
  const base = ((name || "").split("/").pop() || "").toLowerCase();

  // Картинка (svg через <img> скрипты не исполняет — безопасно).
  if (m.startsWith("image/")) return { kind: "image", lang: "" };
  // PDF.
  if (m === "application/pdf" || ext === "pdf") return { kind: "pdf", lang: "" };
  // Офис → конвертация в PDF агентом.
  if (OFFICE_EXT.has(ext) || OFFICE_MIME_PREFIX.some((p) => m.startsWith(p))) {
    return { kind: "office", lang: "" };
  }
  // Markdown.
  if (ext === "md" || ext === "markdown" || ext === "mdx" || m === "text/markdown") {
    return { kind: "markdown", lang: "markdown" };
  }
  // Код/текст по расширению.
  if (CODE_EXT_LANG[ext]) return { kind: "code", lang: CODE_EXT_LANG[ext] };
  if (SPECIAL_CODE_NAMES.has(base)) return { kind: "code", lang: base };
  // Код/текст по MIME.
  if (m.startsWith("text/") || CODE_MIME.has(m)) {
    return { kind: "code", lang: CODE_EXT_LANG[ext] || "text" };
  }
  // Картинка по расширению (когда MIME общий/пустой).
  if (IMAGE_EXT.has(ext)) return { kind: "image", lang: "" };

  return { kind: "other", lang: "" };
}