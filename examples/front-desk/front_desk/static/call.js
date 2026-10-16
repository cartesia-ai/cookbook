import { CartesiaAgentClient } from "/static/vendor/agents-web.js";

const $ = (id) => document.getElementById(id);
const button = $("call-button");
const turnsEl = $("turns");
const PHONE = button.querySelector("svg")?.outerHTML ?? "";
const PHONE_OFF =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272"/><path d="M22 2 2 22"/><path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473"/></svg>';

let client = null;
let callId = null;
const bubbles = new Map();

function setStatus(title, desc, dot = "") {
  $("status-title").textContent = title;
  $("status-desc").textContent = desc;
  $("dot").className = `dot ${dot}`;
}

function setButton(inCall) {
  button.className = `btn btn-wide ${inCall ? "btn-end" : "btn-primary"}`;
  button.innerHTML = inCall ? `${PHONE_OFF} End call` : `${PHONE} Start call`;
}

function showError(text) {
  $("call-error-text").textContent = text;
  $("call-error").classList.remove("hidden");
}

function bubble(key, cls, text) {
  $("turns-empty")?.remove();
  let el = bubbles.get(key);
  if (!el) {
    el = document.createElement("div");
    el.className = `bubble ${cls}`;
    bubbles.set(key, el);
    turnsEl.append(el);
  }
  el.textContent = text;
  turnsEl.scrollTop = turnsEl.scrollHeight;
}

async function getToken() {
  const res = await fetch("/api/token", { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(body.error || "Could not start a call.");
  return body.token;
}

async function runTool(name, parameters) {
  bubble(`tool-${Math.random()}`, "tool", `Used ${name}`);
  const res = await fetch(`/api/client-tools/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id: callId, parameters }),
  });
  if (!res.ok) throw new Error(`Tool ${name} failed.`);
  return await res.text();
}

async function syncCall(id) {
  setStatus("Saving the call", "Fetching the transcript and latency from Cartesia.");
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 1500 : 2500));
    const res = await fetch(`/api/calls/${encodeURIComponent(id)}/sync`, { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && (body.status === "completed" || body.status === "failed")) break;
  }
  setStatus("Call ended", "Saved to Calls.");
  const link = $("open-call");
  link.href = `/calls/${encodeURIComponent(id)}`;
  link.classList.remove("hidden");
}

async function start() {
  $("call-error").classList.add("hidden");
  $("open-call").classList.add("hidden");
  bubbles.clear();
  turnsEl.replaceChildren();
  button.disabled = true;
  setStatus("Connecting", "Asking for the microphone and opening the call.");
  client = new CartesiaAgentClient({ agentId: button.dataset.agentId, getToken });
  client.on("ready", (e) => {
    callId = e.callId;
    setStatus("On the call", "Say hello. Ask to book an appointment.", "live");
  });
  client.on("transcript", (e) => e.text && bubble(`turn-${e.turn}`, e.role === "user" ? "user" : "agent", e.text));
  client.on("speaking", (e) => $("dot").classList.toggle("speaking", e.who === "agent"));
  client.on("client_tool_call", async (e) => {
    try {
      e.respond(await runTool(e.toolName, e.parameters));
    } catch (err) {
      e.respond(String(err.message || err), { isError: true, errorType: "tool_failed" });
    }
  });
  client.on("error", (e) => {
    if (e.fatal) showError(e.message);
  });
  client.on("close", () => {
    setButton(false);
    button.disabled = false;
    const id = callId;
    client = null;
    if (id) syncCall(id);
    else setStatus("Ready", "Use headphones so the receptionist does not hear itself.");
  });
  try {
    await client.start();
    setButton(true);
  } catch (err) {
    setStatus("Ready", "Use headphones so the receptionist does not hear itself.");
    showError(err?.message || "Could not start the call.");
    client = null;
  } finally {
    button.disabled = false;
  }
}

button.addEventListener("click", () => {
  if (client) {
    button.disabled = true;
    setStatus("Hanging up", "");
    client.stop();
  } else {
    start();
  }
});
