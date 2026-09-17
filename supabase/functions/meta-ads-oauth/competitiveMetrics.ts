type DateRange = { since: string; until: string };

type CompetitiveContext = {
  clientId: string;
  clientName: string;
  instagramAccountId: string;
  competitors: Array<Record<string, unknown>>;
  ownInsights: Array<Record<string, unknown>>;
  ownPosts: Array<Record<string, unknown>>;
};

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateOnly(value: unknown) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function profileUsername(value: unknown) {
  const raw = String(value || "").trim();
  const urlMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/i);
  const username = (urlMatch?.[1] || raw).replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(username) ? username : "";
}

function mediaInRange(media: Record<string, unknown>, range: DateRange) {
  const date = dateOnly(media.timestamp);
  return Boolean(date && date >= range.since && date <= range.until);
}

function ownMetrics(context: CompetitiveContext, range: DateRange) {
  const insights = context.ownInsights
    .filter((row) => !row.is_excluded && dateOnly(row.date) >= range.since && dateOnly(row.date) <= range.until)
    .sort((left, right) => dateOnly(left.date).localeCompare(dateOnly(right.date)));
  const posts = context.ownPosts.filter((row) => {
    const date = dateOnly(row.published_at);
    return !row.is_excluded && date >= range.since && date <= range.until;
  });
  const reach = posts.reduce((sum, post) => sum + (numberOrNull(post.reach) || 0), 0);
  const engagement = posts.reduce((sum, post) => sum + (numberOrNull(post.engagement) || 0), 0);
  const followers = numberOrNull(insights[insights.length - 1]?.followers_count);
  const engagementRates = posts.map((post) => numberOrNull(post.engagement_rate)).filter((value): value is number => value != null);
  return {
    followers,
    posts: posts.length,
    reach,
    engagement,
    engagement_rate: engagementRates.length ? engagementRates.reduce((sum, value) => sum + value, 0) / engagementRates.length : null,
    source: "dados orgânicos sincronizados do cliente",
  };
}

async function fetchPublicProfile(accessToken: string, instagramAccountId: string, username: string, range: DateRange) {
  const fields = `business_discovery.username(${username}){username,name,followers_count,media_count,profile_picture_url,media.limit(50){id,like_count,comments_count,timestamp,media_type,permalink}}`;
  const query = new URLSearchParams({ fields, access_token: accessToken });
  const response = await fetch(`https://graph.facebook.com/v24.0/${instagramAccountId}?${query}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.error_user_msg || payload.error.message || "Falha ao consultar o perfil público na Meta");
  const profile = payload.business_discovery;
  if (!profile) throw new Error("Perfil não encontrado ou sem acesso oficial para Business Discovery");
  const media = (profile.media?.data || []).filter((item: Record<string, unknown>) => mediaInRange(item, range));
  const likes = media.reduce((sum: number, item: Record<string, unknown>) => sum + (numberOrNull(item.like_count) || 0), 0);
  const comments = media.reduce((sum: number, item: Record<string, unknown>) => sum + (numberOrNull(item.comments_count) || 0), 0);
  const followers = numberOrNull(profile.followers_count);
  const totalEngagement = likes + comments;
  return {
    username: profileUsername(profile.username || username),
    name: profile.name || `@${username}`,
    profile_picture_url: profile.profile_picture_url || null,
    followers,
    media_count: numberOrNull(profile.media_count),
    posts_in_period: media.length,
    likes_in_period: likes,
    comments_in_period: comments,
    engagement_in_period: totalEngagement,
    engagement_rate: followers && media.length ? (totalEngagement / media.length / followers) * 100 : null,
    observed_media: media.map((item: Record<string, unknown>) => ({
      id: item.id,
      date: dateOnly(item.timestamp),
      type: item.media_type || null,
      permalink: item.permalink || null,
      likes: numberOrNull(item.like_count),
      comments: numberOrNull(item.comments_count),
    })),
    source: "Meta Graph API Business Discovery",
    source_scope: "métricas públicas observadas; sem alcance, impressões ou salvamentos privados",
    sample_limit: 50,
    coverage_note: "A comparação usa até 50 publicações retornadas pela API oficial para o perfil consultado.",
  };
}

export async function buildCompetitiveReport(accessToken: string, context: CompetitiveContext, range: DateRange) {
  const competitors = [];
  for (const competitor of context.competitors) {
    const username = profileUsername(competitor.username || competitor.profile_url);
    if (!username) continue;
    try {
      competitors.push({
        id: competitor.id,
        profile_url: competitor.profile_url,
        status: "ok",
        profile: await fetchPublicProfile(accessToken, context.instagramAccountId, username, range),
      });
    } catch (error) {
      competitors.push({
        id: competitor.id,
        profile_url: competitor.profile_url,
        username,
        status: "error",
        error: error instanceof Error ? error.message : "Não foi possível consultar este perfil pela API oficial.",
      });
    }
  }

  return {
    client_id: context.clientId,
    client_name: context.clientName,
    requested_period: range,
    own: ownMetrics(context, range),
    competitors,
    source: "Meta Graph API Business Discovery",
    generated_at: new Date().toISOString(),
    coverage_note: "Métricas de concorrentes são observações públicas e podem ficar limitadas às publicações retornadas pela API oficial.",
  };
}
