import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isLoggedIn, DOMAIN } from '../browser/session.js';
import { withErrorHandling } from '../utils/errors.js';

export function registerStatusTools(server: McpServer): void {
  server.tool(
    'check_login_status',
    'Check whether the saved browser session is logged into Shopee. ' +
      'Useful to verify setup before calling search_products / get_product_detail, ' +
      'since those fail slowly (a full page load) when the session is signed out.',
    {},
    async () => {
      return withErrorHandling(async () => {
        const loggedIn = await isLoggedIn();
        const text = loggedIn
          ? `✅ Logged in to ${DOMAIN}. search_products and get_product_detail are ready to use.`
          : `🔒 Not logged in to ${DOMAIN}.\n\nRun \`npm run login\` (or \`shopee-mcp-login\`) once, ` +
            `sign in in the Chromium window that opens, then retry.`;
        return { content: [{ type: 'text', text }] };
      });
    },
  );
}
