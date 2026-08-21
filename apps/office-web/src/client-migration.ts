import type { MasterDataApiClient } from "@megabin/api-client";
const esc = (v: unknown) =>
  String(v ?? "—").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
interface Batch {
  batchId: string;
  sourceName: string;
  status: string;
  rowCount: number;
  version: number;
  profile?: Record<string, unknown>;
  dryRunSummary?: Record<string, unknown>;
}
interface Detail extends Batch {
  rows: readonly {
    rowId: string;
    rowNumber: number;
    source: Record<string, unknown>;
    canonical: Record<string, unknown>;
    reconciliation: Record<string, unknown>;
    proposedPlan: Record<string, unknown>;
    classification: string;
    validationErrors: readonly unknown[];
    decisionVersion: number;
    outcome?: string;
  }[];
  reconciliationReport?: Record<string, unknown>;
}
export async function renderClientMigrationWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  logout: () => Promise<void>
) {
  let message = "";
  const load = async () => {
    const result = await api.clientMigrations<{ items: readonly Batch[] }>();
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="back">Master Data</button><button aria-current="page">Client Migration</button></nav></aside><main><header><div><h1>Client Migration</h1><p>Profile, reconcile, review, and activate controlled source batches.</p></div><button id="logout">Sign out</button></header>${message ? `<div class="notice">${esc(message)}</div>` : ""}${permissions.includes("client_migration.create") ? `<section class="panel"><h2>Import canonical CSV</h2><form id="migration-create"><label>Source name<input name="sourceName" value="synthetic-client-migration.csv" required></label><label>Canonical CSV<textarea name="csv" rows="7" required></textarea></label><button class="button">Create and import batch</button></form></section>` : ""}<section class="panel"><h2>Batches</h2><table><thead><tr><th>Source</th><th>Status</th><th>Rows</th><th></th></tr></thead><tbody>${result.items.map((b) => `<tr><td>${esc(b.sourceName)}</td><td>${esc(b.status)}</td><td>${b.rowCount}</td><td><button data-batch="${b.batchId}">Open</button></td></tr>`).join("")}</tbody></table></section><dialog id="migration-detail"><div id="migration-content"></div></dialog></main></div>`;
    root.querySelector("#logout")?.addEventListener("click", () => void logout());
    root
      .querySelector<HTMLFormElement>("#migration-create")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (!(form instanceof HTMLFormElement)) return;
        const f = new FormData(form);
        const csv = String(f.get("csv"));
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csv));
        const hash = [...new Uint8Array(bytes)]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
        try {
          const b = await api.createClientMigration<Batch>({
            sourceType: "canonical_csv",
            sourceName: String(f.get("sourceName")),
            sourceFileHash: hash,
            mappingVersion: "canonical-v1"
          });
          await api.actOnClientMigration(b.batchId, "import", { expectedVersion: b.version, csv });
          message = "Migration batch imported.";
          await load();
        } catch (c) {
          message = c instanceof Error ? c.message : "Import failed.";
          await load();
        }
      });
    root
      .querySelectorAll<HTMLButtonElement>("[data-batch]")
      .forEach((b) =>
        b.addEventListener("click", async () =>
          show(await api.clientMigrationDetail<Detail>(b.dataset.batch ?? ""))
        )
      );
  };
  const show = (d: Detail) => {
    const dialog = root.querySelector<HTMLDialogElement>("#migration-detail"),
      content = root.querySelector<HTMLElement>("#migration-content");
    if (!dialog || !content) return;
    content.innerHTML = `<h2>${esc(d.sourceName)}</h2><p class="status">${esc(d.status)}</p><div class="detail-grid"><section><h3>Profile</h3><pre>${esc(JSON.stringify(d.profile ?? {}, null, 2))}</pre></section><section><h3>Dry run / reconciliation</h3><pre>${esc(JSON.stringify(d.dryRunSummary ?? d.reconciliationReport ?? {}, null, 2))}</pre></section></div><div class="actions">${d.status === "uploaded" ? '<button data-batch-action="process">Profile and reconcile</button>' : ""}${d.status === "needs_review" && permissions.includes("client_migration.review") ? '<button data-safe-mode="approve_new_without_warnings">Approve safe new rows</button><button data-safe-mode="approve_no_change">Approve exact no-change rows</button>' : ""}${["needs_review", "ready"].includes(d.status) ? '<button data-batch-action="dry-run">Run dry run</button>' : ""}${d.status === "dry_run_complete" && permissions.includes("client_migration.approve") ? '<button data-batch-action="approve">Approve batch</button>' : ""}${d.status === "approved" && permissions.includes("client_migration.activate") ? '<button data-batch-action="activate">Activate batch</button>' : ""}<button id="migration-close">Close</button></div><table><thead><tr><th>Row</th><th>Classification</th><th>Source / normalized / existing / proposed</th><th></th></tr></thead><tbody>${d.rows.map((r) => `<tr><td>${r.rowNumber}</td><td>${esc(r.classification)}</td><td><details><summary>Compare</summary><div class="detail-grid"><pre>${esc(JSON.stringify(r.source, null, 2))}</pre><pre>${esc(JSON.stringify(r.canonical, null, 2))}</pre><pre>${esc(JSON.stringify(r.reconciliation, null, 2))}</pre><pre>${esc(JSON.stringify(r.proposedPlan, null, 2))}</pre></div></details></td><td>${permissions.includes("client_migration.review") && !r.outcome ? `<button data-row="${r.rowId}">Approve plan</button>` : esc(r.outcome)}</td></tr>`).join("")}</tbody></table>`;
    content.querySelector("#migration-close")?.addEventListener("click", () => dialog.close());
    content.querySelectorAll<HTMLButtonElement>("[data-safe-mode]").forEach((button) =>
      button.addEventListener("click", async () => {
        await api.actOnClientMigration(d.batchId, "bulk-review-safe", {
          mode: button.dataset.safeMode
        });
        message = "Safe homogeneous rows reviewed.";
        dialog.close();
        await load();
      })
    );
    content.querySelectorAll<HTMLButtonElement>("[data-batch-action]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await api.actOnClientMigration(
            d.batchId,
            b.dataset.batchAction as "process" | "dry-run" | "approve" | "activate",
            { expectedVersion: d.version }
          );
          message = `Migration ${b.dataset.batchAction} succeeded.`;
          dialog.close();
          await load();
        } catch (c) {
          message = c instanceof Error ? c.message : "Migration action failed.";
          dialog.close();
          await load();
        }
      })
    );
    content.querySelectorAll<HTMLButtonElement>("[data-row]").forEach((b) =>
      b.addEventListener("click", async () => {
        const r = d.rows.find((x) => x.rowId === b.dataset.row);
        if (!r) return;
        await api.reviewClientMigrationRow(r.rowId, {
          expectedVersion: r.decisionVersion,
          decision: "approved",
          plan: r.proposedPlan
        });
        message = "Migration row approved.";
        dialog.close();
        await load();
      })
    );
    dialog.showModal();
  };
  await load();
}
