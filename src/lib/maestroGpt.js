import { askMaestroAI } from "@/api/supabaseClient";

function stripCodeFence(value) {
  return String(value || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonOutput(value) {
  if (value && typeof value === "object") return value;
  const text = stripCodeFence(value);
  try {
    return JSON.parse(text);
  } catch {
    const start = Math.min(...[text.indexOf("{"), text.indexOf("[")].filter(index => index >= 0));
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("A resposta do GPT não veio em formato estruturado.");
  }
}

export async function invokeMaestroGpt({ prompt, response_json_schema, context = {} }) {
  const message = response_json_schema
    ? `${prompt}\n\nResponda exclusivamente com um JSON válido conforme o schema solicitado. Não inclua markdown, comentários ou texto fora do JSON.`
    : prompt;
  const output = await askMaestroAI({
    message,
    response_json_schema,
    context: { ...context, output_format: response_json_schema ? "json" : "text" },
  });
  return response_json_schema ? parseJsonOutput(output) : output;
}
