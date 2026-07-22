export interface PackageDefinition {
  id: string;
  name: string;
  credits: number;
  creditsToGrant: number;
  usdcAmount: number;
  amountUsdc: number;
  amountKes: number;
  priceUsdc: number;
  priceKes: number;
  durationDays: number;
  description?: string;
}

export const PACKAGE_MAP = {
  free: {
    id: "free",
    name: "Free",
    credits: 3,
    creditsToGrant: 3,
    usdcAmount: 0,
    amountUsdc: 0,
    amountKes: 0,
    priceUsdc: 0,
    priceKes: 0,
    durationDays: 0,
    description: "Free starter credits for first-time users",
  },
  starter: {
    id: "starter",
    name: "Starter",
    credits: 10,
    creditsToGrant: 10,
    usdcAmount: 2,
    amountUsdc: 2,
    amountKes: 260,
    priceUsdc: 2,
    priceKes: 260,
    durationDays: 30,
    description: "10 credits for a simple top-up",
  },
  growth: {
    id: "growth",
    name: "Growth",
    credits: 50,
    creditsToGrant: 50,
    usdcAmount: 7,
    amountUsdc: 7,
    amountKes: 900,
    priceUsdc: 7,
    priceKes: 900,
    durationDays: 30,
    description: "50 credits for regular business use",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    credits: 200,
    creditsToGrant: 200,
    usdcAmount: 20,
    amountUsdc: 20,
    amountKes: 2600,
    priceUsdc: 20,
    priceKes: 2600,
    durationDays: 90,
    description: "200 credits for heavier usage",
  },
} as const satisfies Record<string, PackageDefinition>;

export type PackageId = keyof typeof PACKAGE_MAP;