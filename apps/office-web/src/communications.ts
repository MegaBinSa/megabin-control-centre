import type { MasterDataApiClient } from "@megabin/api-client";
const esc = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
interface Intent {
  intentId: string;
  clientId: string;
  clientName: string;
  communicationType: string;
  status: string;
  requestedAt: string;
  templateKey: string;
  templateVersion: number;
  attempts: { channel: string; provider: string; status: string; failureClassification?: string }[];
}
interface Inbound {
  inboundMessageId: string;
  channel: string;
  receivedAt: string;
  matchClassification: string;
  recognizedCommand: string;
  status: string;
}
export async function renderCommunicationsWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  logout: () => Promise<void>
) {
  let intents: readonly Intent[] = [],
    inbound: readonly Inbound[] = [],
    health: unknown,
    message = "";
  const load = async () => {
    [intents, inbound, health] = await Promise.all([
      api.communicationIntents<{ items: Intent[] }>().then((r) => r.items),
      permissions.includes("communications.inbound.read")
        ? api.inboundMessages<{ items: Inbound[] }>().then((r) => r.items)
        : Promise.resolve([]),
      api.communicationProviderHealth()
    ]);
    render();
  };
  const render = () => {
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="back">Master Data</button><button aria-current="page">Communications</button></nav></aside><main><header><div><h1>Client Communications</h1><p>Auditable delivery · WhatsApp → SMS → Email</p></div><button id="logout">Sign out</button></header>${message ? `<div class="notice">${esc(message)}</div>` : ""}<section class="panel"><div class="toolbar"><span class="status">Provider health available</span>${permissions.includes("communications.send") ? '<button id="test-send">Send approved test message</button>' : ""}</div><small>${esc(JSON.stringify(health))}</small></section><section class="panel"><h2>Communication history</h2><table><thead><tr><th>Client</th><th>Type</th><th>Status</th><th>Fallback path</th><th>Template</th></tr></thead><tbody>${intents.map((i) => `<tr><td>${esc(i.clientName)}</td><td>${esc(i.communicationType)}</td><td>${esc(i.status)}</td><td>${i.attempts.map((a) => `${esc(a.channel)}: ${esc(a.status)}`).join(" → ") || "Pending"}</td><td>${esc(i.templateKey)} v${i.templateVersion}</td></tr>`).join("") || '<tr><td colspan="5">No communications yet.</td></tr>'}</tbody></table></section><section class="panel"><h2>Inbound messages</h2><table><thead><tr><th>Received</th><th>Channel</th><th>Match</th><th>Command</th><th>Review status</th></tr></thead><tbody>${inbound.map((i) => `<tr><td>${esc(i.receivedAt)}</td><td>${esc(i.channel)}</td><td>${esc(i.matchClassification)}</td><td>${esc(i.recognizedCommand)}</td><td>${esc(i.status)}</td></tr>`).join("") || '<tr><td colspan="5">No inbound messages.</td></tr>'}</tbody></table></section><dialog id="test-dialog"><form id="test-form"><h2>Approved test template</h2><label>Client ID<input name="clientId" required></label><label>Client display name<input name="clientName" required maxlength="200"></label><div class="actions"><button type="button" id="cancel-test">Cancel</button><button class="button">Queue test</button></div></form></dialog></main></div>`;
    root.querySelector("#logout")?.addEventListener("click", () => void logout());
    const dialog = root.querySelector<HTMLDialogElement>("#test-dialog");
    root.querySelector("#test-send")?.addEventListener("click", () => dialog?.showModal());
    root.querySelector("#cancel-test")?.addEventListener("click", () => dialog?.close());
    root.querySelector<HTMLFormElement>("#test-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget as HTMLFormElement);
      const clientId = String(form.get("clientId"));
      await api.communicationTestSend({
        communicationType: "test_message",
        clientId,
        sourceDomain: "manual",
        sourceReference: `office-test-${crypto.randomUUID()}`,
        templateKey: "test_message",
        templateVersion: 1,
        priority: "normal",
        variables: { clientName: String(form.get("clientName")) }
      });
      dialog?.close();
      message = "Test communication queued; environment recipient controls apply.";
      await load();
    });
  };
  await load();
}
