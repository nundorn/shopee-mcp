import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { shopeeCapture, shopeeUrl } from '../api/client.js';
import { BASE_URL } from '../browser/session.js';
import { cache } from '../utils/cache.js';
import { formatPrice, formatCount, getRegion } from '../region.js';
import { withErrorHandling } from '../utils/errors.js';
import type { SearchItemsResponse, SearchItem, ItemBasic } from '../api/types.js';

/**
 * Shopee search response mixes plain product cards (with `item_basic`) and
 * recommendation/ads cards that nest real products under `real_items`.
 * Flatten both shapes into a single list of `ItemBasic`, dropping any card
 * (or nested real item) that has neither.
 */
function fromCard(it: SearchItem): ItemBasic | null {
  const name = it.item_card_displayed_asset?.name;
  const itemid = it.itemid || it.item_data?.itemid;
  const shopid = it.shopid || it.item_data?.shopid;
  if (!name || !itemid || !shopid) return null;

  const price = it.item_data?.item_card_display_price;
  const sold = it.item_data?.item_card_display_sold_count;
  const amount = price?.price ?? 0;
  return {
    itemid,
    shopid,
    name,
    price: amount,
    price_min: amount,
    price_max: amount,
    price_before_discount: price?.strikethrough_price ?? 0,
    currency: getRegion().currency,
    // The card carries no stock or like count; the detail tool has them.
    stock: 0,
    sold: sold?.monthly_sold_count ?? 0,
    historical_sold: sold?.historical_sold_count ?? 0,
    liked_count: 0,
    discount: price?.discount ? `${price.discount}%` : undefined,
    item_rating: it.item_rating ?? { rating_star: 0, rating_count: [] },
    shop_location: it.item_card_displayed_asset?.shop_location ?? '',
    is_official_shop: false,
    shopee_verified: false,
    image: '',
  };
}

export function flattenSearchItems(items: SearchItem[] | null | undefined): ItemBasic[] {
  return (items ?? []).flatMap((it) => {
    if (it.item_basic) return [it.item_basic];
    if (it.real_items?.length) return it.real_items.map((ri) => ri.item_basic).filter(Boolean);
    const card = fromCard(it);
    return card ? [card] : [];
  });
}

// Price and count formatting follow the storefront's region (see src/region.ts).
export { formatPrice };

function priceText(b: ItemBasic): string {
  if (b.price_min && b.price_max && b.price_min !== b.price_max) {
    return `${formatPrice(b.price_min, b.currency)} – ${formatPrice(b.price_max, b.currency)}`;
  }
  return formatPrice(b.price, b.currency);
}

// Sort option → Shopee search-URL params.
const SORT_MAP: Record<string, { sortBy: string; order?: string }> = {
  relevance: { sortBy: 'relevancy' },
  newest: { sortBy: 'ctime' },
  top_sales: { sortBy: 'sales' },
  price_low: { sortBy: 'price', order: 'asc' },
  price_high: { sortBy: 'price', order: 'desc' },
};

export function registerSearchTools(server: McpServer): void {
  server.tool(
    'search_products',
    'Search for products on Shopee by keyword, with sorting and pagination. ' +
      'Returns product names, prices, sold counts, ratings, seller location, product IDs, and direct URLs. ' +
      'Requires a one-time login (run `npm run login`) because Shopee blocks anonymous requests.',
    {
      query: z.string().min(1).describe('The search query, e.g. "laptop gaming", "sepatu nike"'),
      page: z.number().int().min(1).default(1).describe('Page number (default: 1)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(60)
        .default(20)
        .describe('Max results to show from the page, 1-60 (default: 20)'),
      sort: z
        .enum(['relevance', 'newest', 'top_sales', 'price_low', 'price_high'])
        .default('relevance')
        .describe('Sort order (default: relevance)'),
    },
    async ({ query, page, limit, sort }) => {
      return withErrorHandling(async () => {
        const cacheKey = cache.key('search', query, page, limit, sort);
        const cached = cache.get<string>(cacheKey);
        if (cached) return { content: [{ type: 'text', text: cached }] };

        const { sortBy, order } = SORT_MAP[sort] ?? SORT_MAP.relevance;
        const qs = new URLSearchParams({ keyword: query, page: String(page - 1), sortBy });
        if (order) qs.set('order', order);
        const searchUrl = shopeeUrl(`/search?${qs.toString()}`);

        const data = await shopeeCapture<SearchItemsResponse>(searchUrl, 'search/search_items');

        const items = flattenSearchItems(data.items);
        if (items.length === 0) {
          return {
            content: [
              { type: 'text', text: `No products found for "${query}". Try a different keyword.` },
            ],
          };
        }

        const shown = items.slice(0, limit);
        const totalCount = data.total_count ?? 0;
        // Estimate only: `items.length` is Shopee's per-request page size, but flattening
        // an ads card into multiple real_items (see flattenSearchItems) can inflate it
        // above that true size, undercounting totalPages. Shopee doesn't expose the real
        // page size otherwise, so this stays an approximation — it doesn't affect
        // pagination itself, only the displayed page count.
        const totalPages = totalCount > 0 ? Math.ceil(totalCount / items.length) : page;

        const lines: string[] = [
          `🛒 Search Results for "${query}"`,
          `📊 ${formatCount(totalCount)} total products | Page ${page}${totalPages > 1 ? `/${totalPages}` : ''}`,
          ``,
        ];

        shown.forEach((b, i) => {
          const rank = (page - 1) * limit + i + 1;
          const rating = b.item_rating?.rating_star
            ? `⭐ ${b.item_rating.rating_star.toFixed(1)}`
            : '⭐ N/A';
          const sold = b.historical_sold || b.sold || 0;
          const soldText = sold > 0 ? ` | 📦 ${formatCount(sold)} sold` : '';
          const official = b.is_official_shop ? ' [Shopee Mall]' : '';
          const url = `${BASE_URL}/product/${b.shopid}/${b.itemid}`;

          lines.push(`${rank}. **${b.name}**`);
          lines.push(`   💰 ${priceText(b)}`);
          lines.push(
            `   ${rating}${soldText} | 🏪 ${b.shop_location || 'N/A'}${official} | 🆔 ${b.itemid}`,
          );
          lines.push(`   🔗 ${url}`);
          if (i < shown.length - 1) lines.push('');
        });

        if (!data.nomore) {
          lines.push(``, `📄 Use page=${page + 1} to see more results.`);
        }

        const text = lines.join('\n');
        cache.set(cacheKey, text);
        return { content: [{ type: 'text', text }] };
      });
    },
  );
}
