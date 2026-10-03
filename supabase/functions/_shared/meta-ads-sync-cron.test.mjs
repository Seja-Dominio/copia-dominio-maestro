import assert from "node:assert/strict";
import test from "node:test";
import { createMetaAdsSyncCronHandler } from "./meta-ads-sync-cron.mjs";

const now = Date.parse("2030-01-01T00:00:00.000Z");

function createSupabaseFixture({
  authorized = true,
  accounts = [],
  products = [],
  organizations = [],
  memberships = [],
  collaborators = [],
} = {}) {
  const calls = { rpc: [], from: [] };
  const tables = { maestro_ads_accounts: accounts, organization_products: products, organizations, organization_members: memberships, maestro_collaborators: collaborators };
  const supabase = {
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: authorized, error: null };
    },
    from(table) {
      calls.from.push(table);
      const filters = [];
      const query = {
        select() { return this; },
        eq(column, value) { filters.push([column, value]); return this; },
        in(column, values) { filters.push([column, values]); return this; },
        async maybeSingle() {
          const row = (tables[table] || []).find((candidate) => filters.every(([column, value]) => {
            if (column === "organizations.status") return candidate.organizations?.status === value;
            return candidate[column] === value;
          }));
          return { data: row || null, error: null };
        },
        then(resolve, reject) {
          const rows = (tables[table] || []).filter((candidate) => filters.every(([column, value]) => {
            if (column === "organizations.status") return candidate.organizations?.status === value;
            return Array.isArray(value) ? value.includes(candidate[column]) : candidate[column] === value;
          }));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { supabase, calls };
}

function makeRequest(secret = "valid-cron-secret") {
  return new Request("https://dev.example/functions/v1/meta-ads-sync-cron", {
    method: "POST",
    headers: secret ? { "x-maestro-cron-secret": secret } : {},
  });
}

function makeHandler(fixture, fetchImpl, fixedNow = now) {
  return createMetaAdsSyncCronHandler({
    supabase: fixture.supabase,
    projectUrl: "https://dev.example/",
    serviceRoleKey: "test-service-role",
    sessionSecret: "test-session-secret",
    fetchImpl,
    nowMs: () => fixedNow,
  });
}

test("scheduled sync calls the protected Ads Brain endpoint with tenant-scoped manager session", async () => {
  const fixture = createSupabaseFixture({
    accounts: [{ organization_id: "org-active", network: "Meta Ads" }, { organization_id: "org-expired", network: "Meta Ads" }],
    products: [
      { organization_id: "org-active", product_key: "ads_brain", status: "enabled", expires_at: "2031-01-01T00:00:00.000Z" },
      { organization_id: "org-expired", product_key: "ads_brain", status: "enabled", expires_at: "2029-12-31T23:59:59.000Z" },
    ],
    organizations: [{ id: "org-active", status: "active" }, { id: "org-expired", status: "active" }],
    memberships: [{ organization_id: "org-active", collaborator_id: "user-manager", role: "manager", status: "active", organizations: { status: "active" } }],
    collaborators: [{ id: "user-manager", is_active: true, profile: { access_level: "collaborator", permissions: { tabs: { AdsBrain: true } } } }],
  });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ synced: 1, results: [{ account_id: "account-1" }] });
  };

  const response = await makeHandler(fixture, fetchImpl)(makeRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    results: [{ organization_id: "org-active", status: "ok", synced_accounts: 1, failed_accounts: 0 }],
  });
  assert.equal(fixture.calls.rpc[0].name, "meta_ads_sync_cron_authorized");
  assert.deepEqual(fixture.calls.rpc[0].args, { p_secret: "valid-cron-secret" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://dev.example/functions/v1/meta-ads-oauth");
  assert.equal(calls[0].options.headers.apikey, "test-service-role");
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: "sync", period: "Este mês", source: "automatic" });
  const encodedSession = calls[0].options.headers.Authorization.split(" ")[1].split(".")[0];
  assert.deepEqual(JSON.parse(atob(encodedSession.replace(/-/g, "+").replace(/_/g, "/"))), {
    sub: "user-manager",
    organization_id: "org-active",
    exp: Math.floor(now / 1000) + 300,
  });
});

test("global admin profile cannot become a manager when active membership is only member", async () => {
  const fixture = createSupabaseFixture({
    accounts: [{ organization_id: "org-member", network: "Meta Ads" }],
    products: [{ organization_id: "org-member", product_key: "maestro", status: "trial", expires_at: null }],
    organizations: [{ id: "org-member", status: "active" }],
    memberships: [{ organization_id: "org-member", collaborator_id: "user-member", role: "member", status: "active", organizations: { status: "active" } }],
    collaborators: [{ id: "user-member", is_active: true, profile: { access_level: "master" } }],
  });
  let fetchCount = 0;
  const response = await makeHandler(fixture, async () => { fetchCount++; return Response.json({ synced: 0 }); })(makeRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    results: [{ organization_id: "org-member", status: "skipped", reason: "no_active_manager" }],
  });
  assert.equal(fetchCount, 0);
});

test("manager membership with explicit Ads Brain denial is not used for scheduled sync", async () => {
  const fixture = createSupabaseFixture({
    accounts: [{ organization_id: "org-denied", network: "Meta Ads" }],
    products: [{ organization_id: "org-denied", product_key: "ads_brain", status: "enabled", expires_at: null }],
    organizations: [{ id: "org-denied", status: "active" }],
    memberships: [{ organization_id: "org-denied", collaborator_id: "user-denied", role: "manager", status: "active", organizations: { status: "active" } }],
    collaborators: [{ id: "user-denied", is_active: true, profile: { permissions: { tabs: { AdsBrain: false } } } }],
  });
  let fetchCount = 0;
  const response = await makeHandler(fixture, async () => { fetchCount++; return Response.json({ synced: 0 }); })(makeRequest());
  assert.equal(response.status, 200);
  assert.equal(fetchCount, 0);
  assert.equal((await response.json()).results[0].reason, "no_active_manager");
});

test("missing or invalid cron authorization fails before reading tenants or calling Ads Brain", async () => {
  for (const { secret, authorized, expectedStatus } of [
    { secret: "", authorized: true, expectedStatus: 401 },
    { secret: "wrong-secret", authorized: false, expectedStatus: 401 },
  ]) {
    const fixture = createSupabaseFixture({ authorized });
    let fetchCount = 0;
    const response = await makeHandler(fixture, async () => { fetchCount++; return Response.json({}); })(makeRequest(secret));
    assert.equal(response.status, expectedStatus);
    assert.equal(fixture.calls.from.length, 0);
    assert.equal(fetchCount, 0);
  }
});

test("a downstream Ads Brain failure is reported as partial without crashing the cron handler", async () => {
  const fixture = createSupabaseFixture({
    accounts: [{ organization_id: "org-active", network: "Meta Ads" }],
    products: [{ organization_id: "org-active", product_key: "maestro", status: "enabled", expires_at: null }],
    organizations: [{ id: "org-active", status: "active" }],
    memberships: [{ organization_id: "org-active", collaborator_id: "user-manager", role: "owner", status: "active", organizations: { status: "active" } }],
    collaborators: [{ id: "user-manager", is_active: true, profile: {} }],
  });
  const response = await makeHandler(fixture, async () => new Response("unavailable", { status: 503 }))(makeRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "partial",
    results: [{ organization_id: "org-active", status: "error", http_status: 503 }],
  });
});
