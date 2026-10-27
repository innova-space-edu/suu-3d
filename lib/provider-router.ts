import type { ChatMessage } from "./providers";

type Id = "dell" | "groq" | "sambanova" | "openrouter" | "gemini" | "legacy";
type Config = {
  id: Id;
  name: string;
  model: string;
  key: string;
  url: string;
  extraHeaders?: Record<string, string>;
};
type Status = { id: Id; name: string; model: string; configured: boolean };

const endpoints = {
  groq: "https://api.groq.com/openai/v1",
  sambanova: "https://api.sambanova.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

function configuredDellUrl(raw?: string) {
  if (!raw?.trim()) return "";
  try {
    const url = new URL(raw.trim());
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && loopback)) return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return (url.origin + url.pathname).replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function providerConfigs(): Config[] {
  const choose = (...values: (string | undefined)[]) =>
    values.find(value => value?.trim())?.trim() || "";
  const dellUrl = configuredDellUrl(process.env.SUU_DELL_API_BASE_URL);
  const dellKey = choose(process.env.SUU_DELL_API_TOKEN);
  const accessId = choose(process.env.SUU_DELL_CF_ACCESS_CLIENT_ID);
  const accessSecret = choose(process.env.SUU_DELL_CF_ACCESS_CLIENT_SECRET);
  const accessConsistent = Boolean(accessId) === Boolean(accessSecret);
  const dellConfigured = Boolean(dellUrl && dellKey && accessConsistent);
  const dellHeaders = accessId && accessSecret
    ? { "CF-Access-Client-Id": accessId, "CF-Access-Client-Secret": accessSecret }
    : undefined;

  const input: Config[] = [
    ...(dellConfigured ? [{
      id: "dell" as const,
      name: "Servidor Dell",
      key: dellKey,
      model: choose(process.env.SUU_DELL_MODEL, "suu-local"),
      url: dellUrl,
      extraHeaders: dellHeaders,
    }] : []),
    { id: "groq", name: "Groq", key: choose(process.env.GROQ_API_KEY, process.env.SUU_GROQ_API_KEY), model: choose(process.env.GROQ_MODEL, "llama-3.3-70b-versatile"), url: endpoints.groq },
    { id: "sambanova", name: "SambaNova", key: choose(process.env.SAMBANOVA_API_KEY_SUU, process.env.SAMBANOVA_API_KEY), model: choose(process.env.SAMBANOVA_MODEL_SUU, "Meta-Llama-3.3-70B-Instruct"), url: endpoints.sambanova },
    { id: "openrouter", name: "OpenRouter", key: choose(process.env.OPENROUTER_API_KEY_SUU, process.env.OPENROUTER_API_KEY), model: choose(process.env.OPENROUTER_MODEL_SUU, "meta-llama/llama-3.3-70b-instruct"), url: endpoints.openrouter },
    { id: "gemini", name: "Gemini", key: choose(process.env.GEMINI_API_KEY_SUU, process.env.GEMINI_API_KEY), model: choose(process.env.GEMINI_MODEL_SUU, "gemini-2.5-flash"), url: endpoints.gemini },
  ];

  // Preserve legacy Groq / cloud configuration without treating arbitrary URLs as trusted.
  const oldKey = process.env.SUU_LLM_API_KEY?.trim();
  const oldModel = process.env.SUU_LLM_MODEL?.trim();
  const oldUrl = process.env.SUU_LLM_BASE_URL?.trim().replace(/\/+$/, "");
  const legacyMatch = input.find(p => p.url === oldUrl);
  if (oldKey && oldModel && legacyMatch && !legacyMatch.key) {
    legacyMatch.key = oldKey;
    legacyMatch.model = oldModel;
  } else if (oldKey && oldModel && oldUrl && Object.values(endpoints).includes(oldUrl) && !legacyMatch) {
    input.push({ id: "legacy", name: "Anterior", key: oldKey, model: oldModel, url: oldUrl });
  }
  return input.filter(p => p.key && p.model);
}

export function providerStatus(): Status[] {
  const active = providerConfigs();
  const list: Array<{ id: Id; name: string }> = [
    { id: "dell", name: "Servidor Dell" },
    { id: "groq", name: "Groq" },
    { id: "sambanova", name: "SambaNova" },
    { id: "openrouter", name: "OpenRouter" },
    { id: "gemini", name: "Gemini" },
  ];
  return list.map(p => ({
    ...p,
    configured: active.some(c => c.id === p.id),
    model: active.find(c => c.id === p.id)?.model || "",
  }));
}

export type ChatStreamOptions = {signal?: AbortSignal; onDelta?: (text: string) => void};

/** OpenAI-compatible SSE. Bound events, preserve UTF-8 and reject broken streams. */
export async function readChatCompletionStream(response: Response, onDelta: (text: string) => void) {
  if (!response.body) throw new Error("Missing completion stream");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", event = "", reply = "", complete = false;
  const consume = () => {
    const payload = event.trim(); event = "";
    if (!payload) return;
    if (payload === "[DONE]") {complete = true; return;}
    const data = JSON.parse(payload);
    if (data.error) throw new Error("Provider stream error");
    const choice = data.choices?.[0];
    const delta = choice?.delta?.content;
    // Never speak reasoning_content or tool-call arguments.
    if (typeof delta === "string" && delta && !complete) {
      if (reply.length + delta.length > 12000) throw new Error("Completion too long");
      reply += delta; onDelta(delta);
    }
    if (choice?.finish_reason) complete = true;
  };
  try {
    while (true) {
      const {value, done} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream: true});
      if (buffer.length > 65536) throw new Error("Stream event too large");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ""); buffer = buffer.slice(end + 1);
        if (!line) consume();
        else if (line.startsWith("data:")) event += line.slice(5).trimStart() + "\n";
        if (event.length > 65536) throw new Error("Stream event too large");
      }
      if (done) {if (buffer.startsWith("data:")) event += buffer.slice(5); consume(); break;}
      if (complete) break;
    }
    if (!complete || !reply.trim()) throw new Error("Incomplete completion stream");
    return reply;
  } finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
}

export async function chatWithFallback(messages: ChatMessage[], system: string, options: ChatStreamOptions = {}) {
  const available = providerConfigs().slice(0, 5);
  if (!available.length) throw new Error("No hay proveedor de IA configurado para SUU.");
  const failures: string[] = [];
  const start = Date.now();
  // Reserve sufficient time for SUU's Next.js API route (maxDuration=60s).
  const totalBudgetMs = 54000;
  for (let i = 0; i < available.length; i++) {
    const p = available[i];
    const remaining = totalBudgetMs - (Date.now() - start);
    if (remaining < 2000) break;
    if (options.signal?.aborted) throw new Error("Conversación cancelada");
    let emitted = false, firstTextMs: number | undefined;
    const emit = (text: string) => {
      emitted = true;
      firstTextMs ??= Date.now() - start;
      options.onDelta?.(text);
    };
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, {once: true});
    if (options.signal?.aborted) cancel();
    const timeout = Math.min(p.id === "dell" ? 22000 : 10500, remaining - 1200);
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(p.url + "/chat/completions", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + p.key,
          ...(p.extraHeaders || {}),
          ...(p.id === "openrouter"
            ? { "HTTP-Referer": "https://suu-3d.vercel.app", "X-Title": "SUU 3D" }
            : {}),
        },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.4,
          // A 0.8B CPU model produces about 10 tokens/s on this Dell.
          // Cap Dell output so it usually completes before the 22s failover.
          max_tokens: p.id === "dell" ? 96 : 900,
          messages: [{
            role: "system",
            content: p.id === "dell"
              ? system + "\nPara esta respuesta de voz, usa español natural y sé breve: 1-3 frases, sin listas, máximo 45 palabras. Responde directamente a lo preguntado."
              : system,
          }, ...messages],
          stream: Boolean(options.onDelta),
        }),
      });
      if (!response.ok) {
        const status = response.status;
        const reason = status === 401 || status === 403 ? "autenticación rechazada"
          : status === 429 ? "cuota o límite de solicitudes"
          : status === 400 || status === 404 ? "modelo o petición inválidos"
          : status >= 500 ? "servicio temporalmente no disponible"
          : "solicitud rechazada";
        failures.push(p.name + ": " + reason + " (HTTP " + status + ")");
        console.warn("[SUU failover]", p.id, status);
        continue;
      }
      let reply: unknown;
      const delivery = options.onDelta && response.headers.get("content-type")?.includes("text/event-stream") ? "sse" : "json";
      if (delivery === "sse") {
        reply = await readChatCompletionStream(response, emit);
      } else {
        const data = await response.json();
        reply = data?.choices?.[0]?.message?.content;
        if (options.onDelta && typeof reply === "string" && reply.trim()) emit(reply.slice(0, 12000));
      }
      if (typeof reply !== "string" || !reply.trim()) throw new Error("Empty response");
      return {
        reply: reply.slice(0, 12000),
        provider: p.name,
        model: p.model,
        fallbackUsed: i > 0,
        timing: {firstTextMs: firstTextMs ?? Date.now() - start, totalMs: Date.now() - start, delivery},
      };
    } catch {
      if (options.signal?.aborted) throw new Error("Conversación cancelada");
      // Switching providers after audible text would mix/repeat two answers.
      if (emitted) throw new Error("Se interrumpió la respuesta de SUU. Vuelve a preguntar.");
      const timedOut = controller.signal.aborted;
      failures.push(p.name + ": " + (timedOut ? "tiempo de espera agotado" : "fallo de red o respuesta inválida"));
      console.warn("[SUU failover]", p.id, timedOut ? "timeout" : "network_or_response");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
  }
  throw new Error("No se pudo obtener respuesta. " + failures.join("; ") + ". Revisa los proveedores de SUU.");
}
