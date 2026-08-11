import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const markdownLink = /\[[^\]]*\]\(([^)]+)\)/gu;

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(absolute);
      return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : [];
    })
  );
  return nested.flat();
}

const failures = [];
for (const file of await markdownFiles(docsRoot)) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(markdownLink)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget || /^(?:https?:|mailto:|#)/u.test(rawTarget)) continue;

    const withoutAngles = rawTarget.replace(/^<|>$/gu, "");
    const [pathname] = withoutAngles.split("#", 1);
    if (!pathname) continue;

    const target = path.resolve(path.dirname(file), decodeURIComponent(pathname));
    try {
      await access(target);
    } catch {
      failures.push(`${path.relative(root, file)} -> ${rawTarget}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Broken local documentation links:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Documentation links are valid.");
}
