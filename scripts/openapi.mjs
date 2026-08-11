import { writeFile, readFile, mkdir } from "node:fs/promises";
import { createOpenApiDocument } from "../packages/runtime/dist/http.js";

const target = new URL("../docs/api/openapi.json", import.meta.url);
const generated = `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8");
  if (current !== generated)
    throw new Error("Generated OpenAPI is out of date. Run pnpm openapi:generate.");
} else {
  await mkdir(new URL("../docs/api/", import.meta.url), { recursive: true });
  await writeFile(target, generated);
}
