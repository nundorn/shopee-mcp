import 'dotenv/config';

/**
 * Shopee runs one storefront per country, and each one expects a browser that
 * looks like it belongs there: matching locale, timezone and currency. Pointing
 * SHOPEE_DOMAIN at another country while the browser still claims id-ID /
 * Asia/Jakarta is both wrong for formatting and a giveaway to Shopee's
 * anti-bot checks, so domain is the single source of truth for all three.
 */
export interface Region {
  /** BCP-47 tag used for the browser locale and every number we format. */
  locale: string;
  /** IANA zone reported by the browser fingerprint. */
  timezone: string;
  /** ISO-4217 code the storefront prices in. */
  currency: string;
}

const REGIONS: Record<string, Region> = {
  'shopee.co.id': { locale: 'id-ID', timezone: 'Asia/Jakarta', currency: 'IDR' },
  'shopee.co.th': { locale: 'th-TH', timezone: 'Asia/Bangkok', currency: 'THB' },
  'shopee.vn': { locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' },
  'shopee.ph': { locale: 'en-PH', timezone: 'Asia/Manila', currency: 'PHP' },
  'shopee.com.my': { locale: 'ms-MY', timezone: 'Asia/Kuala_Lumpur', currency: 'MYR' },
  'shopee.sg': { locale: 'en-SG', timezone: 'Asia/Singapore', currency: 'SGD' },
  'shopee.tw': { locale: 'zh-TW', timezone: 'Asia/Taipei', currency: 'TWD' },
  'shopee.com.br': { locale: 'pt-BR', timezone: 'America/Sao_Paulo', currency: 'BRL' },
};

const DEFAULT_REGION: Region = REGIONS['shopee.co.id'];

/** How each storefront writes its own prices. */
const CURRENCY_FORMAT: Record<string, { symbol: string; decimals: number }> = {
  IDR: { symbol: 'Rp', decimals: 0 },
  THB: { symbol: '฿', decimals: 2 },
  VND: { symbol: '₫', decimals: 0 },
  PHP: { symbol: '₱', decimals: 2 },
  MYR: { symbol: 'RM', decimals: 2 },
  SGD: { symbol: 'S$', decimals: 2 },
  TWD: { symbol: 'NT$', decimals: 0 },
  BRL: { symbol: 'R$', decimals: 2 },
};

export function getRegion(domain = process.env.SHOPEE_DOMAIN || 'shopee.co.id'): Region {
  const base = REGIONS[domain] ?? DEFAULT_REGION;
  // Explicit env wins, so an unlisted or newly launched storefront still works.
  return {
    locale: process.env.SHOPEE_LOCALE || base.locale,
    timezone: process.env.SHOPEE_TIMEZONE || base.timezone,
    currency: process.env.SHOPEE_CURRENCY || base.currency,
  };
}

/** Shopee stores prices as the real amount x 100000. */
export function formatPrice(raw: number, currency?: string): string {
  const region = getRegion();
  const code = currency || region.currency;
  const amount = raw / 100000;
  const fmt = CURRENCY_FORMAT[code];
  if (!fmt) return `${code} ${amount.toLocaleString(region.locale)}`;
  return `${fmt.symbol}${amount.toLocaleString(region.locale, {
    minimumFractionDigits: fmt.decimals,
    maximumFractionDigits: fmt.decimals,
  })}`;
}

/** Counts (sold, reviews, stock) grouped the way the storefront's locale does. */
export function formatCount(n: number): string {
  return n.toLocaleString(getRegion().locale);
}
