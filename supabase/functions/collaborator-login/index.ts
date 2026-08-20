import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CollaboratorRow = {
  id: string;
  login: string;
  password_hash: string;
  is_active: boolean;
  profile: Record<string, unknown>;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifyPassword(password: string, storedHash: string) {
  // Compatibilidade com os hashes SHA-256+salt e com registros plaintext legados.
  if (!storedHash.includes(":")) return storedHash === password;

  const [saltHex, expectedHash] = storedHash.split(":");
  const data = new TextEncoder().encode(saltHex + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const actualHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return actualHash === expectedHash;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);

    const { login, password } = await request.json();
    if (!login || !password) {
      return json({ error: "Login e senha são obrigatórios" }, 400);
    }

    const { data, error } = await supabase
      .from("maestro_collaborators")
      .select("id, login, password_hash, is_active, profile")
      .ilike("login", String(login).trim())
      .maybeSingle<CollaboratorRow>();

    if (error) throw error;
    if (!data || !(await verifyPassword(String(password), data.password_hash))) {
      return json({ error: "Usuário ou senha incorretos" }, 401);
    }
    if (!data.is_active) {
      return json({ error: "Sua conta está desativada. Contate o administrador." }, 403);
    }

    return json({ success: true, collaborator: data.profile });
  } catch (error) {
    console.error("Collaborator login error:", error);
    return json({ error: "Erro ao autenticar. Tente novamente." }, 500);
  }
});
