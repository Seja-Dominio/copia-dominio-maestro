import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { client_id, instagram_account_id } = await req.json();
    if (!client_id || !instagram_account_id) {
      return Response.json({ error: 'client_id and instagram_account_id are required' }, { status: 400 });
    }

    const token = secrets.get("INSTAGRAM_ACCESS_TOKEN");
    if (!token) {
      return Response.json({ error: 'INSTAGRAM_ACCESS_TOKEN not configured' }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];

    // 1. Fetch account info (followers)
    const accountRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagram_account_id}?fields=followers_count,media_count&access_token=${token}`
    );
    const accountData = await accountRes.json();
    if (accountData.error) {
      return Response.json({ error: accountData.error.message }, { status: 400 });
    }

    // 2. Fetch account insights (reach, impressions, profile_views, website_clicks)
    const metricsToFetch = 'reach,impressions,profile_views,website_clicks';
    const insightsRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagram_account_id}/insights?metric=${metricsToFetch}&period=day&access_token=${token}`
    );
    const insightsData = await insightsRes.json();

    let profileReach = 0, profileImpressions = 0, profileViews = 0, websiteClicks = 0;
    if (insightsData.data) {
      for (const metric of insightsData.data) {
        const lastValue = metric.values?.[metric.values.length - 1]?.value || 0;
        if (metric.name === 'reach') profileReach = lastValue;
        if (metric.name === 'impressions') profileImpressions = lastValue;
        if (metric.name === 'profile_views') profileViews = lastValue;
        if (metric.name === 'website_clicks') websiteClicks = lastValue;
      }
    }

    // Check if daily insight already exists
    const existing = await base44.asServiceRole.entities.ClientInsight.filter(
      { client_id, date: today }
    );

    const insightData = {
      client_id,
      date: today,
      followers_count: accountData.followers_count || 0,
      profile_reach: profileReach,
      profile_impressions: profileImpressions,
      profile_views: profileViews,
      website_clicks: websiteClicks,
    };

    if (existing.length > 0) {
      await base44.asServiceRole.entities.ClientInsight.update(existing[0].id, insightData);
    } else {
      await base44.asServiceRole.entities.ClientInsight.create(insightData);
    }

    // 3. Fetch recent media posts
    const mediaRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagram_account_id}/media?fields=id,caption,media_type,permalink,thumbnail_url,timestamp&limit=25&access_token=${token}`
    );
    const mediaData = await mediaRes.json();

    let postsProcessed = 0;
    if (mediaData.data) {
      for (const post of mediaData.data) {
        const existingPost = await base44.asServiceRole.entities.PostMetric.filter(
          { client_id, post_id: post.id }
        );

        let likes = 0, comments = 0, shares = 0, saves = 0, reach = 0, impressions = 0, videoViews = 0;
        try {
          const postInsightsRes = await fetch(
            `https://graph.facebook.com/v21.0/${post.id}/insights?metric=likes,comments,shares,saved,reach,impressions&access_token=${token}`
          );
          const postInsights = await postInsightsRes.json();
          if (postInsights.data) {
            for (const m of postInsights.data) {
              const v = m.values?.[0]?.value || 0;
              if (m.name === 'likes') likes = v;
              if (m.name === 'comments') comments = v;
              if (m.name === 'shares') shares = v;
              if (m.name === 'saved') saves = v;
              if (m.name === 'reach') reach = v;
              if (m.name === 'impressions') impressions = v;
            }
          }

          if (post.media_type === 'VIDEO' || post.media_type === 'REELS') {
            const videoRes = await fetch(
              `https://graph.facebook.com/v21.0/${post.id}?fields=video_views&access_token=${token}`
            );
            const videoData = await videoRes.json();
            videoViews = videoData.video_views || 0;
          }
        } catch (e) {
          // Some posts may not support all metrics
        }

        const totalEngagement = likes + comments + shares + saves;
        const engRate = reach > 0 ? Math.round((totalEngagement / reach) * 10000) / 100 : 0;

        const postData = {
          client_id,
          post_id: post.id,
          post_type: post.media_type === 'CAROUSEL_ALBUM' ? 'CAROUSEL_ALBUM' : post.media_type || 'IMAGE',
          caption: (post.caption || '').slice(0, 500),
          permalink: post.permalink || '',
          thumbnail_url: post.thumbnail_url || '',
          published_at: post.timestamp || '',
          likes, comments, shares, saves, reach, impressions,
          video_views: videoViews,
          engagement: totalEngagement,
          engagement_rate: engRate,
        };

        if (existingPost.length > 0) {
          await base44.asServiceRole.entities.PostMetric.update(existingPost[0].id, postData);
        } else {
          await base44.asServiceRole.entities.PostMetric.create(postData);
        }
        postsProcessed++;
      }
    }

    return Response.json({
      success: true,
      followers: accountData.followers_count,
      reach: profileReach,
      posts_processed: postsProcessed,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}