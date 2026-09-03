import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Loader2, Save, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

function extractUsername(input) {
  const trimmed = input.trim();
  // Handle full URL: https://www.instagram.com/username/ or instagram.com/username
  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  // Handle @username
  return trimmed.replace(/^@/, "").toLowerCase();
}

export default function InstagramSetupForm({ client, onSaved }) {
  const [linkInput, setLinkInput] = useState(
    client.instagram_username
      ? `https://www.instagram.com/${client.instagram_username.replace("@", "")}/`
      : ""
  );
  const [accountId, setAccountId] = useState(client.instagram_account_id || "");
  const [fetching, setFetching] = useState(false);
  const [fetchedData, setFetchedData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const username = extractUsername(linkInput);

  async function handleFetch() {
    if (!username) return;
    setFetching(true);
    setError("");
    setFetchedData(null);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Acesse o perfil do Instagram https://www.instagram.com/${username}/ e extraia as informações públicas visíveis na página do perfil:
- Nome de exibição do perfil
- Biografia/descrição
- Número de seguidores
- Número de publicações/posts
- Se a conta é verificada (selo azul)
- Categoria do perfil (se visível)

Importante: o perfil existe, o username é "${username}". Retorne found: true e os dados encontrados.
Se realmente não conseguir acessar nenhuma informação, retorne found: false.`,
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: {
            found: { type: "boolean" },
            profile_name: { type: "string" },
            bio: { type: "string" },
            followers: { type: "string" },
            posts_count: { type: "string" },
            is_verified: { type: "boolean" },
            category: { type: "string" },
          },
        },
      });
      if (res.found === false) {
        setError(`Perfil @${username} não encontrado`);
      } else {
        setFetchedData(res);
      }
    } catch (e) {
      setError("Não foi possível buscar dados. Tente novamente.");
    }
    setFetching(false);
  }

  async function handleSave() {
    setSaving(true);
    await base44.entities.Client.update(client.id, {
      instagram_username: username,
      instagram_account_id: accountId.trim() || undefined,
    });
    setSaving(false);
    onSaved?.();
  }

  return (
    <div className="space-y-4">
      {/* Profile link input + fetch */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Link do perfil do Instagram
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            placeholder="https://www.instagram.com/usuario/"
            className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={e => e.key === "Enter" && handleFetch()}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs gap-1.5 px-3"
            onClick={handleFetch}
            disabled={fetching || !username}
          >
            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Buscar
          </Button>
        </div>
        {username && (
          <p className="text-[10px] text-muted-foreground mt-1">Usuário detectado: <span className="font-semibold text-foreground">@{username}</span></p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Fetched data preview */}
      {fetchedData && (
        <div className="bg-gradient-to-br from-pink-50 via-purple-50 to-orange-50 dark:from-pink-900/10 dark:via-purple-900/10 dark:to-orange-900/10 border border-purple-200 dark:border-purple-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
              {(fetchedData.profile_name || username)[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground flex items-center gap-1">
                {fetchedData.profile_name || `@${username}`}
                {fetchedData.is_verified && <span className="text-blue-500 text-xs">✓</span>}
              </p>
              <p className="text-[10px] text-muted-foreground">@{username}</p>
            </div>
          </div>
          {fetchedData.bio && (
            <p className="text-xs text-muted-foreground">{fetchedData.bio}</p>
          )}
          <div className="flex gap-4 text-xs">
            {fetchedData.followers && (
              <div>
                <span className="font-bold text-foreground">{fetchedData.followers}</span>
                <span className="text-muted-foreground ml-1">seguidores</span>
              </div>
            )}
            {fetchedData.posts_count && (
              <div>
                <span className="font-bold text-foreground">{fetchedData.posts_count}</span>
                <span className="text-muted-foreground ml-1">posts</span>
              </div>
            )}
          </div>
          <a
            href={`https://instagram.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary font-semibold hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Ver no Instagram
          </a>
        </div>
      )}

      {/* Account ID (manual/optional) */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Instagram Account ID (Meta API) — opcional
        </label>
        <input
          type="text"
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          placeholder="Ex: 17841400..."
          className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Necessário para sincronizar métricas detalhadas via API do Meta/Facebook
        </p>
      </div>

      {/* Save */}
      <Button
        className="w-full h-9 text-sm gap-1.5"
        onClick={handleSave}
        disabled={saving || !username}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Salvando..." : "Salvar Instagram"}
      </Button>
    </div>
  );
}