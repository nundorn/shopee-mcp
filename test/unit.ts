/**
 * Offline unit tests for pure helpers — no browser, no login, no network.
 * Unlike test/smoke.ts (live), this is safe to run in CI on every push.
 *
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import { flattenSearchItems, formatPrice } from '../src/tools/search.js';
import { parseProductUrl } from '../src/tools/product.js';
import { shopeeCapture, ShopeeAuthRequiredError } from '../src/api/client.js';
import { cache } from '../src/utils/cache.js';
import type { SearchItem, ItemBasic } from '../src/api/types.js';

let failures = 0;
const pending: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>): void {
  pending.push({ name, fn });
}

async function runTests(): Promise<void> {
  for (const { name, fn } of pending) {
    try {
      await fn();
      console.log(`✅ ${name}`);
    } catch (err) {
      failures++;
      console.log(`❌ ${name}`);
      console.log(`   ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function fakeItemBasic(overrides: Partial<ItemBasic> = {}): ItemBasic {
  return {
    itemid: 1,
    shopid: 1,
    name: 'Test Product',
    price: 1000000,
    price_min: 1000000,
    price_max: 1000000,
    price_before_discount: 0,
    currency: 'IDR',
    stock: 10,
    sold: 5,
    historical_sold: 5,
    liked_count: 0,
    item_rating: { rating_star: 4.5, rating_count: [] },
    shop_location: 'Jakarta',
    is_official_shop: false,
    shopee_verified: false,
    image: '',
    ...overrides,
  };
}

// ─── flattenSearchItems (the #25 fix) ──────────────────────────────────────

test('flattenSearchItems: passes through plain cards with item_basic', () => {
  const b = fakeItemBasic({ itemid: 1 });
  const items: SearchItem[] = [{ itemid: 1, shopid: 1, item_basic: b }];
  assert.deepEqual(flattenSearchItems(items), [b]);
});

test('flattenSearchItems: flattens a recommendation/ads card with real_items', () => {
  // Reproduces the exact crash from #25: a card with no top-level item_basic,
  // whose real products are nested under real_items.
  const b1 = fakeItemBasic({ itemid: 1 });
  const b2 = fakeItemBasic({ itemid: 2 });
  const adsCard = {
    itemid: 0,
    shopid: 0,
    item_basic: null as unknown as ItemBasic,
    real_items: [{ item_basic: b1 }, { item_basic: b2 }],
  };
  assert.deepEqual(flattenSearchItems([adsCard]), [b1, b2]);
});

test('flattenSearchItems: mixes plain and ads cards in order', () => {
  const plain = fakeItemBasic({ itemid: 1 });
  const nested = fakeItemBasic({ itemid: 2 });
  const items = [
    { itemid: 1, shopid: 1, item_basic: plain },
    {
      itemid: 0,
      shopid: 0,
      item_basic: null as unknown as ItemBasic,
      real_items: [{ item_basic: nested }],
    },
  ];
  assert.deepEqual(flattenSearchItems(items), [plain, nested]);
});

test('flattenSearchItems: drops a card with neither item_basic nor real_items', () => {
  const dead = { itemid: 0, shopid: 0, item_basic: null as unknown as ItemBasic };
  assert.deepEqual(flattenSearchItems([dead]), []);
});

test('flattenSearchItems: drops null item_basic entries nested in real_items', () => {
  const good = fakeItemBasic({ itemid: 1 });
  const card = {
    itemid: 0,
    shopid: 0,
    item_basic: null as unknown as ItemBasic,
    real_items: [{ item_basic: good }, { item_basic: null as unknown as ItemBasic }],
  };
  assert.deepEqual(flattenSearchItems([card]), [good]);
});

test('flattenSearchItems: handles null/undefined items list', () => {
  assert.deepEqual(flattenSearchItems(null), []);
  assert.deepEqual(flattenSearchItems(undefined), []);
});

// ─── formatPrice ────────────────────────────────────────────────────────────

test('formatPrice: divides by 100000 and formats IDR with Rp prefix', () => {
  assert.equal(formatPrice(15000000000), 'Rp150.000');
});

test('formatPrice: rounds fractional amounts', () => {
  assert.equal(formatPrice(15000050000), 'Rp150.001');
});

test('formatPrice: falls back to "CURRENCY amount" for non-IDR', () => {
  assert.equal(formatPrice(500000000, 'USD'), 'USD 5.000');
});

// ─── parseProductUrl ────────────────────────────────────────────────────────

test('parseProductUrl: parses /product/<shopid>/<itemid> form', () => {
  assert.deepEqual(parseProductUrl('https://shopee.co.id/product/78730497/47060432055'), {
    shopId: '78730497',
    itemId: '47060432055',
  });
});

test('parseProductUrl: parses "-i.<shopid>.<itemid>" slug form', () => {
  assert.deepEqual(
    parseProductUrl('https://shopee.co.id/Some-Product-Name-i.78730497.47060432055'),
    { shopId: '78730497', itemId: '47060432055' },
  );
});

test('parseProductUrl: returns null for an unrelated URL', () => {
  assert.equal(parseProductUrl('https://shopee.co.id/'), null);
});

// ─── cache ──────────────────────────────────────────────────────────────────

test('cache: set/get round-trips within TTL', () => {
  cache.set('unit-test-key', 'value');
  assert.equal(cache.get('unit-test-key'), 'value');
});

test('cache: get returns undefined for a missing key', () => {
  assert.equal(cache.get('never-set-key'), undefined);
});

test('cache: key() joins parts with ":"', () => {
  assert.equal(cache.key('search', 'shoes', 1, 20, 'relevance'), 'search:shoes:1:20:relevance');
});

// ─── shopeeCapture retry-on-timeout ─────────────────────────────────────────

test('shopeeCapture: recovers from a single timeout via retry, no auth error', async () => {
  let calls = 0;
  const flakyCapture = async () => {
    calls++;
    if (calls === 1) throw new Error('Timeout 30000ms exceeded');
    return { error: 0, items: [] };
  };
  const result = await shopeeCapture(
    'https://x',
    'search/search_items',
    undefined,
    false,
    flakyCapture,
  );
  assert.equal(calls, 2);
  assert.deepEqual(result, { error: 0, items: [] });
});

test('shopeeCapture: reports auth-required only after a second consecutive timeout', async () => {
  let calls = 0;
  const alwaysTimesOut = async () => {
    calls++;
    throw new Error('Timeout 30000ms exceeded');
  };
  await assert.rejects(
    () => shopeeCapture('https://x', 'search/search_items', undefined, false, alwaysTimesOut),
    ShopeeAuthRequiredError,
  );
  assert.equal(calls, 2);
});

await runTests();
console.log(
  `\n${failures === 0 ? '✅ All unit tests passed' : `❌ ${failures} unit test(s) failed`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
