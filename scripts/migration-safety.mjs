import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const destructivePatterns = [
  ["drop_table", /\bdrop\s+table\b/i],
  ["drop_column", /\bdrop\s+column\b/i],
  ["mass_delete", /\bdelete\s+from\b(?![\s\S]*\bwhere\b)/i],
  ["rls_disable", /\bdisable\s+row\s+level\s+security\b/i],
  ["broad_grant", /\bgrant\s+all\b/i],
  ["destructive_type_change", /\balter\s+column\b[\s\S]*\btype\b/i]
];

export function inspectSql(sql, file = "migration.sql") {
  return destructivePatterns
    .filter(([, pattern]) => pattern.test(sql))
    .map(([kind]) => ({ file, kind }));
}

export function changedMigrationFiles(range = "HEAD^..HEAD") {
  return execFileSync("git", ["diff", "--name-only", range, "--", "supabase/migrations/*.sql"], {
    encoding: "utf8"
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

const cliEntryPath = process.argv[1];

if (cliEntryPath && import.meta.url === pathToFileURL(resolve(cliEntryPath)).href) {
  const rangeIndex = process.argv.indexOf("--git-range");
  const range = rangeIndex >= 0 ? process.argv[rangeIndex + 1] : "HEAD^..HEAD";
  const files = changedMigrationFiles(range);
  const findings = files.flatMap((file) => inspectSql(readFileSync(file, "utf8"), file));
  console.log(`Migration inventory: ${files.length} changed migration(s) in ${range}.`);
  for (const finding of findings) console.error(`REVIEW: ${finding.kind} in ${finding.file}`);
  if (findings.length && process.env.ALLOW_DESTRUCTIVE_MIGRATIONS !== "reviewed") process.exit(2);
  console.log(
    findings.length
      ? "Destructive migration review explicitly acknowledged."
      : "No guarded destructive patterns detected."
  );
}
