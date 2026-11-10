import { build } from "vite";
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
await build({
  root, build: {
    manifest: true,
    rollupOptions: { input: { index: join(root, "index.html"), public: join(root, "src", "public.tsx") } },
  },
});
const appearanceBuild = await build({
  root, publicDir: false,
  build: {
    outDir: dist, emptyOutDir: false,
    rollupOptions: {
      input: join(root, "src", "appearance-init.ts"),
      output: { format: "iife", entryFileNames: "assets/appearance-[hash].js", inlineDynamicImports: true },
    },
  },
});
const appearanceEntry = appearanceBuild.output.find(chunk => chunk.type === "chunk" && chunk.isEntry);
if (!appearanceEntry) throw new Error("Missing blocking appearance initializer.");
const template = (await readFile(join(dist, "index.html"), "utf8"))
  .replace("<!--appearance:init-->", `<script src="/${appearanceEntry.fileName}"></script>`);
const manifest = JSON.parse(await readFile(join(dist, ".vite", "manifest.json"), "utf8"));
const styles = new Set();
function collectStyles(key) {
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing public build manifest entry: ${key}`);
  for (const dependency of chunk.imports ?? []) collectStyles(dependency);
  for (const css of chunk.css ?? []) styles.add(css);
}
collectStyles("src/public.tsx");
const privateEntry = manifest["index.html"];
const publicEntry = manifest["src/public.tsx"];
if (!privateEntry || !publicEntry) throw new Error("Missing public or private client entry.");
const publicTemplate = template.replace(`src="/${privateEntry.file}"`, `src="/${publicEntry.file}"`);
if (publicTemplate === template) throw new Error("The frontend template is missing its client entry.");
const stylesheetLinks = [...styles].filter(css => !template.includes(`href="/${css}"`))
  .map(css => `<link rel="stylesheet" href="/${css}">`).join("\n");
const metadataMarker = /<!--page-metadata:start-->[\s\S]*?<!--page-metadata:end-->/;
if (!metadataMarker.test(template) || !template.includes('<div id="root"></div>')) {
  throw new Error("The frontend template is missing its metadata or public rendering marker.");
}

const serverOutput = await mkdtemp(join(root, ".prerender-"));
try {
  await build({
    root, publicDir: false,
    build: {
      ssr: join(root, "src", "prerender.tsx"), outDir: serverOutput,
      rollupOptions: { output: { entryFileNames: "prerender.mjs" } },
    },
  });
  const { renderPublicPages, workspaceHead } = await import(pathToFileURL(join(serverOutput, "prerender.mjs")).href);
  const pages = renderPublicPages();
  await writeFile(join(dist, "spa.html"), template.replace(metadataMarker, () => workspaceHead));
  for (const page of pages) {
    const destination = join(dist, page.path.slice(1), "index.html");
    const html = publicTemplate.replace(metadataMarker, () => page.head)
      .replace("</head>", `${stylesheetLinks}\n</head>`)
      .replace('<html lang="en">', '<html lang="en" data-theme="dark" data-appearance="dark" style="color-scheme:dark">')
      .replace('<div id="root"></div>', () => `<div id="root" data-prerendered="true">${page.body}</div>`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, html);
  }
  console.log(`Pre-rendered ${pages.length} public pages; private workspace uses spa.html.`);
} finally {
  await rm(serverOutput, { recursive: true, force: true });
}
await rm(join(dist, ".vite", "manifest.json"));
await rmdir(join(dist, ".vite"));
