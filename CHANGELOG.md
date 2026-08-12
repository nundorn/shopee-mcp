# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0/). For **how** we version, tag, and publish, see [docs/RELEASES.md](./docs/RELEASES.md).

## [Unreleased]

## [0.2.0] - 2026-08-12

### Added

- **New tool `check_login_status`** — reports whether the saved browser session is currently logged into Shopee, so a client can check auth state upfront instead of waiting on a slow failure inside `search_products` / `get_product_detail`.
- `test/unit.ts` — a fast, offline unit test suite (no login/display needed) covering the `real_items` search-result flattening, price formatting, product URL parsing, the TTL cache, and the new capture-retry logic. Wired into CI via `npm run test:unit`, which now runs on every push/PR alongside lint/typecheck/build.

### Fixed

- `search_products` no longer crashes on Shopee's recommendation/ads search cards, which nest their real products under `real_items` instead of the usual top-level `item_basic` (thanks [@teguholica](https://github.com/teguholica), #25).
- A timeout waiting for Shopee's API response is now retried once before being reported as "not logged in" — a slow page load or transient network blip was previously indistinguishable from the anti-bot gate silently dropping the request.

### Changed

- Bumped `@modelcontextprotocol/sdk` (1.29.0 → 1.30.0), `cloakbrowser` (0.4.12 → 0.5.5), and `playwright` (1.61.1 → 1.62.1), plus development tooling (`eslint`, `prettier`, `tsx`, `lint-staged`, `typescript-eslint`).
- The MCP server now reports its actual `package.json` version at connect time instead of a hardcoded, previously-stale string.

## [0.1.1] - 2026-07-21

### Added

- Standardized project scaffolding: `LICENSE` (MIT), `.editorconfig`, ESLint + Prettier, Conventional Commits (commitlint), Husky pre-commit hooks, CI + release workflows, issue/PR templates, and a `docs/` guide set.

### Changed

- Updated runtime and development dependencies, and standardized the npm trusted-publishing release workflow.

## [0.1.0] - 2026-07-12

### Added

- Initial release: MCP server for **exploring Shopee** over stdio, driving a logged-in CloakBrowser session to clear Shopee's anti-bot gate.
- **2 tools:** `search_products` (keyword search with sorting & pagination) and `get_product_detail` (price, discount, brand, condition, rating, review/sold counts, stock, location, description).
- In-memory read cache and a persistent browser profile under `~/.shopee-mcp/`.

[Unreleased]: https://github.com/bintangtimurlangit/shopee-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bintangtimurlangit/shopee-mcp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/bintangtimurlangit/shopee-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/bintangtimurlangit/shopee-mcp/releases/tag/v0.1.0
