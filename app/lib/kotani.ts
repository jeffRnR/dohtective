// app/lib/kotani.ts
// ─────────────────────────────────────────────────────────────────────────────
// Kotani Pay v3 API client.
//
// Architecture:
//   The user pays KES via M-Pesa STK push.
//   Kotani converts KES → USDC and sends it to your Avalanche C-Chain address.
//   You receive USDC on Avalanche. The user never sees any of this.
//
// Key discovery from the API docs:
//   POST /api/v3/onramp accepts chain: "AVALANCHE" and token: "USDC" natively.
//   No bridging. No CCTP. One API call. KES in → USDC on Avalanche out.
//
// Environment variables required:
//   KOTANI_API_KEY              — from your Kotani integrator dashboard
//   KOTANI_AVALANCHE_ADDRESS    — your Avalanche C-Chain 0x wallet address
//                                  (this is where USDC lands after each payment)
//   KOTANI_ENV                  — 'sandbox' | 'production' (default: sandbox)
//
// Flow per transaction:
//   1. getOrCreateKotaniCustomer()  — ensure user has a Kotani customer_key
//   2. getOnrampRate()              — fetch live KES/USDC rate + rateId
//   3. createOnramp()               — initiate M-Pesa STK push + USDC settlement
//   4. Kotani callback fires        — your /api/kotani/callback route handles it
//   5. Credits granted atomically   — DB transaction, idempotency enforced
// ─────────────────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const IS_SANDBOX = (process.env.KOTANI_ENV ?? "sandbox") === "sandbox";

const BASE_URL = IS_SANDBOX
  ? "https://sandbox-api.kotanipay.io"
  : "https://api.kotanipay.io";

// ── Authenticated fetch ────────────────────────────────────────────────────
async function kotaniFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = requireEnv("KOTANI_API_KEY");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers ?? {}),
    },
  });

  const data = await res.json();

  if (!res.ok || data.success === false) {
    const message =
      data.message ??
      data.error ??
      `Kotani API error (${res.status})`;
    throw new Error(message);
  }

  return data.data as T;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type KotaniCustomer = {
  id: string;
  phone_number: string;
  country_code: string;
  network: string;
  customer_key: string;
  account_name: string;
};

export type OnrampRate = {
  from: string;
  to: string;
  value: string;
  id: string;           // rateId — must be passed back to createOnramp
  fiatAmount: number;
  cryptoAmount: number;
  transactionAmount: number;
  fee: number;
};

export type OnrampResponse = {
  id: string;
  referenceId: string;
  referenceNumber: number;
  message: string;
  customerKey: string;
  redirectUrl?: string;
};

export type OnrampStatus = {
  referenceId: string;
  depositStatus: KotaniStatus;
  onchainStatus: KotaniStatus;
  transactionHash?: string;
  rate: object;
  fiatAmount: number;
  cryptoAmount: number;
};

export type KotaniStatus =
  | "PENDING"
  | "INITIATED"
  | "SUCCESSFUL"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "DECLINED"
  | "REVERSED"
  | "IN_PROGRESS"
  | "DUPLICATE"
  | "ERROR_OCCURRED"
  | "REQUIRE_REVIEW"
  | "SUCCESS"
  | "RETRY"
  | "PROCESSED";

export const TERMINAL_SUCCESS: KotaniStatus[] = ["SUCCESSFUL", "SUCCESS", "PROCESSED"];
export const TERMINAL_FAILURE: KotaniStatus[] = [
  "FAILED", "EXPIRED", "CANCELLED", "DECLINED",
  "REVERSED", "ERROR_OCCURRED",
];

// ── 1. Customer management ─────────────────────────────────────────────────
// Kotani requires a customer_key to be created before initiating any payment.
// We store this on the User model (via kotaniCustomerKey field).

export async function createKotaniCustomer(
  phoneNumber: string,
  accountName: string
): Promise<KotaniCustomer> {
  return kotaniFetch<KotaniCustomer>("/api/v3/customer/mobile-money", {
    method: "POST",
    body: JSON.stringify({
      phone_number: phoneNumber,
      country_code: "KE",
      network: "MPESA",
      account_name: accountName,
    }),
  });
}

export async function getKotaniCustomerByPhone(
  phoneNumber: string
): Promise<KotaniCustomer | null> {
  try {
    return await kotaniFetch<KotaniCustomer>(
      `/api/v3/customer/mobile-money/phone/${encodeURIComponent(phoneNumber)}`
    );
  } catch {
    return null;
  }
}

// Ensure a Kotani customer exists for this phone number.
// Creates one if it does not exist yet.
export async function getOrCreateKotaniCustomer(
  phoneNumber: string,
  accountName: string
): Promise<KotaniCustomer> {
  const existing = await getKotaniCustomerByPhone(phoneNumber);
  if (existing) return existing;
  return createKotaniCustomer(phoneNumber, accountName);
}

// ── 2. Live rate fetch ─────────────────────────────────────────────────────
// Always fetch a fresh rate immediately before creating an onramp.
// The rateId is time-limited — use it within 30 seconds.

export async function getOnrampRate(fiatAmountKes: number): Promise<OnrampRate> {
  return kotaniFetch<OnrampRate>("/api/v3/rate/onramp", {
    method: "POST",
    body: JSON.stringify({
      from: "KES",
      to: "USDC",
      fiatAmount: fiatAmountKes,
    }),
  });
}

// ── 3. Create onramp (the core transaction) ────────────────────────────────
// This triggers the M-Pesa STK push to the customer's phone AND tells
// Kotani to send USDC to your Avalanche address once the M-Pesa confirms.
// chain: "AVALANCHE" + token: "USDC" — native, no bridge needed.

export async function createOnramp({
  customerKey,
  phoneNumber,
  fiatAmountKes,
  referenceId,
  callbackUrl,
  rateId,
}: {
  customerKey: string;
  phoneNumber: string;
  fiatAmountKes: number;
  referenceId: string;
  callbackUrl: string;
  rateId: string;
}): Promise<OnrampResponse> {
  const receiverAddress = requireEnv("KOTANI_AVALANCHE_ADDRESS");

  return kotaniFetch<OnrampResponse>("/api/v3/onramp", {
    method: "POST",
    body: JSON.stringify({
      mobileMoney: {
        phoneNumber,
        accountName: "Dohtective",
        providerNetwork: "MPESA",
      },
      fiatAmount: fiatAmountKes,
      currency: "KES",
      chain: "AVALANCHE",
      token: "USDC",
      receiverAddress,
      referenceId,
      callbackUrl,
      rateId,
    }),
  });
}

// ── 4. Status polling ──────────────────────────────────────────────────────
// Used as a fallback when the callback doesn't arrive.
// Tracks BOTH deposit (M-Pesa) and onchain (Avalanche) status separately.

export async function getOnrampStatus(referenceId: string): Promise<OnrampStatus> {
  return kotaniFetch<OnrampStatus>(`/api/v3/onramp/${referenceId}`);
}

// ── Phone normalizer ───────────────────────────────────────────────────────
// Accepts: 07XXXXXXXX, 7XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
// Returns: 2547XXXXXXXX (Kotani format)
export function normalizeKenyanPhone(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, "").replace(/^\+/, "");
  if (/^2547\d{8}$/.test(cleaned)) return cleaned;
  if (/^07\d{8}$/.test(cleaned)) return `254${cleaned.slice(1)}`;
  if (/^7\d{8}$/.test(cleaned)) return `254${cleaned}`;
  return null;
}

// ── User-friendly status messages ─────────────────────────────────────────
export function getStatusMessage(
  depositStatus: KotaniStatus,
  onchainStatus: KotaniStatus
): { message: string; isComplete: boolean; isFailed: boolean } {
  if (TERMINAL_SUCCESS.includes(onchainStatus)) {
    return {
      message: "Payment confirmed. Your credits have been added.",
      isComplete: true,
      isFailed: false,
    };
  }
  if (TERMINAL_SUCCESS.includes(depositStatus) && onchainStatus === "PENDING") {
    return {
      message: "M-Pesa payment received. Sending USDC to Avalanche — usually under 30 seconds.",
      isComplete: false,
      isFailed: false,
    };
  }
  if (TERMINAL_FAILURE.includes(depositStatus)) {
    return {
      message: "Payment did not go through. Check your M-Pesa balance and try again.",
      isComplete: false,
      isFailed: true,
    };
  }
  if (TERMINAL_FAILURE.includes(onchainStatus)) {
    return {
      message: "M-Pesa payment received but the USDC transfer failed. Contact support — you will not be charged.",
      isComplete: false,
      isFailed: true,
    };
  }
  return {
    message: "Check your phone and enter your M-Pesa PIN to complete payment.",
    isComplete: false,
    isFailed: false,
  };
}