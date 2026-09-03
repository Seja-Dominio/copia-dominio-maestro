import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { client_id, client_name, date_from, date_to } = await req.json();
    if (!client_id) {
      return Response.json({ error: 'client_id is required' }, { status: 400 });
    }

    // Fetch insights for the period (not excluded)
    const insights = await base44.asServiceRole.entities.ClientInsight.filter(
      { client_id, is_excluded: false }, '-date', 90
    );

    // Fetch post metrics (not excluded)
    const posts = await base44.asServiceRole.entities.PostMetric.filter(
      { client_id, is_excluded: false }, '-published_at', 50
    );

    // Filter by date range if provided
    const filteredInsights = insights.filter(i => {
      if (date_from && i.date < date_from) return false;
      if (date_to && i.date > date_to) return false;
      return true;
    });

    const filteredPosts = posts.filter(p => {
      const d = p.published_at?.split('T')[0];
      if (date_from && d < date_from) return false;
      if (date_to && d > date_to) return false;
      return true;
    });

    // Build context for the LLM
    const totalReach = filteredInsights.reduce((s, i) => s + (i.profile_reach || 0), 0);
    const avgEngagement = filteredPosts.length > 0
      ? (filteredPosts.reduce((s, p) => s + (p.engagement_rate || 0), 0) / filteredPosts.length).toFixed(2)
      : 0;
    const lastFollowers = filteredInsights[0]?.followers_count || 0;
    const firstFollowers = filteredInsights[filteredInsights.length - 1]?.followers_count || lastFollowers;
    const followerGrowth = lastFollowers - firstFollowers;

    const topPosts = [...filteredPosts].sort((a, b) => (b.engagement || 0) - (a.engagement || 0)).slice(0, 5);
    const worstPosts = [...filteredPosts].sort((a, b) => (a.engagement || 0) - (b.engagement || 0)).slice(0, 3);

    const postsByType = {};
    filteredPosts.forEach(p => {
      const t = p.post_type || 'IMAGE';
      if (!postsByType[t]) postsByType[t] = { count: 0, totalEngagement: 0, totalReach: 0 };
      postsByType[t].count++;
      postsByType[t].totalEngagement += p.engagement || 0;
      postsByType[t].totalReach += p.reach || 0;
    });

    const prompt = `Você é um analista de marketing digital especializado em Instagram. Analise os dados abaixo do cliente "${client_name || 'Cliente'}" no período de ${date_from || 'início'} a ${date_to || 'hoje'} e forneça insights estratégicos.

DADOS DO PERFIL:
- Seguidores atuais: ${lastFollowers}
- Crescimento no período: ${followerGrowth > 0 ? '+' : ''}${followerGrowth}
- Alcance total do perfil: ${totalReach}
- Taxa de engajamento média: ${avgEngagement}%
- Total de posts analisados: ${filteredPosts.length}

PERFORMANCE POR TIPO DE CONTEÚDO:
${Object.entries(postsByType).map(([t, d]) => `- ${t}: ${d.count} posts, engajamento total: ${d.totalEngagement}, alcance total: ${d.totalReach}, engajamento médio: ${d.count > 0 ? (d.totalEngagement / d.count).toFixed(0) : 0}`).join('\n')}

TOP 5 POSTS (maior engajamento):
${topPosts.map((p, i) => `${i + 1}. [${p.post_type}] Engajamento: ${p.engagement} | Alcance: ${p.reach} | Curtidas: ${p.likes} | Comentários: ${p.comments} | Shares: ${p.shares} | Saves: ${p.saves} | Taxa: ${p.engagement_rate}%\n   Legenda: "${(p.caption || '').slice(0, 100)}..."`).join('\n')}

3 POSTS COM MENOR ENGAJAMENTO:
${worstPosts.map((p, i) => `${i + 1}. [${p.post_type}] Engajamento: ${p.engagement} | Alcance: ${p.reach}\n   Legenda: "${(p.caption || '').slice(0, 80)}..."`).join('\n')}

INSTRUÇÕES:
Responda em português brasileiro com:
1. **Resumo Executivo** (3-4 linhas): Visão geral da performance
2. **Pontos Fortes** (2-3 itens): O que está funcionando
3. **Oportunidades de Melhoria** (2-3 itens): O que pode melhorar
4. **3 Ações Recomendadas**: Ações práticas e específicas para os próximos 30 dias
5. **Melhor tipo de conteúdo**: Qual formato está performando melhor e por quê

Seja direto, estratégico e baseado nos dados.`;

    const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude-sonnet-5',
    });

    return Response.json({
      success: true,
      analysis: aiResponse,
      stats: {
        total_posts: filteredPosts.length,
        total_reach: totalReach,
        avg_engagement: avgEngagement,
        followers: lastFollowers,
        follower_growth: followerGrowth,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}