// app/lib/zoho-client.ts
import { prisma } from "./prisma";

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI;
const ACCOUNTS_BASE_URL =
  process.env.ZOHO_ACCOUNTS_BASE_URL ?? "https://accounts.zoho.com";

const SCOPES = "ZohoBooks.fullaccess.all";

export function assertZohoConfigured() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error(
      "Zoho OAuth is not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and " +
        "ZOHO_REDIRECT_URI in .env.local"
    );
  }
}

export function buildAuthorizationUrl(state: string): string {
  assertZohoConfigured();
  const params = new URLSearchParams({
    scope: SCOPES,
    client_id: CLIENT_ID!,
    response_type: "code",
    redirect_uri: REDIRECT_URI!,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${ACCOUNTS_BASE_URL}/oauth/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  api_domain: string;
  token_type: string;
  expires_in: number;
};

export async function exchangeCodeForTokens(
  code: string
): Promise<TokenResponse> {
  assertZohoConfigured();
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    redirect_uri: REDIRECT_URI!,
    grant_type: "authorization_code",
    code,
  });

  const res = await fetch(`${ACCOUNTS_BASE_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Zoho token exchange failed: ${data.error ?? res.statusText}`);
  }
  return data as TokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  assertZohoConfigured();
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(`${ACCOUNTS_BASE_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Zoho token refresh failed: ${data.error ?? res.statusText}`);
  }
  return data as TokenResponse;
}

// ── Token persistence — Prisma (replaces file store) ──────────────────────

export async function saveTokensForBusiness(
  slug: string,
  tokens: {
    refresh_token: string;
    api_domain: string;
    organization_id?: string;
  }
): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!business) throw new Error(`No business found with slug "${slug}".`);

  await prisma.zohoConnection.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      refreshToken: tokens.refresh_token,
      apiDomain: tokens.api_domain,
      organizationId: tokens.organization_id ?? null,
    },
    update: {
      refreshToken: tokens.refresh_token,
      apiDomain: tokens.api_domain,
      organizationId: tokens.organization_id ?? null,
    },
  });
}

export async function getStoredTokens(slug: string): Promise<{
  refresh_token: string;
  api_domain: string;
  organization_id?: string;
} | null> {
  const business = await prisma.business.findUnique({
    where: { slug },
    select: {
      zohoConnection: {
        select: {
          refreshToken: true,
          apiDomain: true,
          organizationId: true,
        },
      },
    },
  });

  if (!business?.zohoConnection) return null;

  return {
    refresh_token: business.zohoConnection.refreshToken,
    api_domain: business.zohoConnection.apiDomain,
    organization_id: business.zohoConnection.organizationId ?? undefined,
  };
}

export async function zohoApiGet(
  slug: string,
  path: string,
  extraParams: Record<string, string> = {}
) {
  const stored = await getStoredTokens(slug);
  if (!stored) {
    throw new Error(
      `No Zoho connection found for business "${slug}". Connect Zoho Books first.`
    );
  }

  const { access_token } = await refreshAccessToken(stored.refresh_token);

  const params = new URLSearchParams({
    organization_id: stored.organization_id ?? "",
    ...extraParams,
  });

  const res = await fetch(
    `${stored.api_domain}/books/v3${path}?${params.toString()}`,
    {
      headers: { Authorization: `Zoho-oauthtoken ${access_token}` },
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Zoho API error on ${path}: ${data.message ?? res.statusText}`
    );
  }
  return data;
}

export async function fetchZohoOrganizations(
  accessToken: string,
  apiDomain: string
) {
  const res = await fetch(`${apiDomain}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Could not fetch Zoho organizations: ${data.message ?? res.statusText}`
    );
  }
  return data.organizations as Array<{
    organization_id: string;
    name: string;
  }>;
}

export async function listOrganizationsForPendingConnection(slug: string) {
  const stored = await getStoredTokens(slug);
  if (!stored) {
    throw new Error(`No pending Zoho connection found for "${slug}".`);
  }
  const { access_token } = await refreshAccessToken(stored.refresh_token);
  return fetchZohoOrganizations(access_token, stored.api_domain);
}