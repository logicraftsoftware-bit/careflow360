import "dotenv/config";

const authorization = process.env.KNOWLARITY_AUTHORIZATION;
const webhookSecret = process.env.KNOWLARITY_WEBHOOK_SECRET;
const apiUrl = process.env.CAREFLOW_API_URL;
if (!authorization || !webhookSecret || !apiUrl) {
  throw new Error("KNOWLARITY_AUTHORIZATION, KNOWLARITY_WEBHOOK_SECRET and CAREFLOW_API_URL are required");
}

const streamUrl = `https://konnect.knowlarity.com:8100/update-stream/${encodeURIComponent(authorization)}/konnect`;
const relayUrl = `${apiUrl.replace(/\/$/, "")}/integrations/knowlarity/webhook`;
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function relay(payload: unknown) {
  const response = await fetch(relayUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": webhookSecret! },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`CareFlow relay rejected event (${response.status}): ${await response.text()}`);
}

async function connect() {
  const response = await fetch(streamUrl, { headers: { accept: "text/event-stream" } });
  if (!response.ok || !response.body) throw new Error(`Knowlarity stream connection failed (${response.status})`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) throw new Error("Knowlarity stream closed");
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const raw = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
      if (!raw) continue;
      try { await relay(JSON.parse(raw)); }
      catch (error) { console.error("Knowlarity event relay failed", error); }
    }
  }
}

for (;;) {
  try { await connect(); }
  catch (error) { console.error("Knowlarity stream disconnected; reconnecting in 5 seconds", error); await wait(5000); }
}
