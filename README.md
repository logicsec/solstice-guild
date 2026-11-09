# Solstice Guild

A Discord-gated single-page app for World of Warcraft: Forever, US Normal Alliance. The Cloudflare Worker serves the SPA, proxies the market data, and stores raid records in D1. Navigation and browser history stay inside the SPA. GitHub stores the source and can deploy it through the included manual workflow.

## Included

- Auction House with categories and subcategories, item search, rarity colors, and Wowhead Forever tooltip links.
- Professions with recipe costs, estimated margins, ingredients, and listed materials.
- Raid creation and review, role slots, up to twelve weekly occurrences, requirements, soft reserves, optional approval and waitlists, private invite links and optional member discovery.
- Saved characters, calendar downloads, roster and group assignments, player assignments, and lock, reopen, or cancel controls.

For sign-ups, create a raid and select **Copy link**. Share that URL with guildmates. Discord sign-in brings them back to that exact raid. A link-only raid is excluded from discovery. A signed-in member of the configured Discord server who has its URL can view it and RSVP. One Discord account can RSVP with one character per raid. The organizer controls approvals and assignments.

## Set up production

1. Extract this package and push its contents to the root of your GitHub repository.
2. Add `solsticeguild.net` as a zone in the Cloudflare account that will host the Worker. Review any existing DNS record for the root domain before attaching the Worker custom domain.
3. Create a Discord application in the [Developer Portal](https://discord.com/developers/applications). Under OAuth2, add the exact redirect URL `https://solsticeguild.net/auth/discord/callback`. Copy its application ID. Enable Developer Mode in Discord and copy the Solstice server ID. Put both IDs in `wrangler.toml`. The application uses the `identify` and `guilds.members.read` scopes to check the signed-in account's server membership.
4. With Node 24 installed, run the commands below and paste the database ID into `wrangler.toml` after creating the database.

```sh
npx wrangler@4 login
npx wrangler@4 d1 create solstice-guild
npx wrangler@4 secret put DISCORD_CLIENT_SECRET
npm run check
npx wrangler@4 d1 migrations apply solstice-guild --remote
npm run deploy
```

Enter the Discord client secret at Wrangler's prompt. Keep it out of GitHub source and browser code. The Worker route in `wrangler.toml` attaches the custom domain. If a secret command creates the Worker before the first deploy, continue with migrations and deployment.

For subsequent GitHub deployments, create a repository environment named `production` and add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as environment secrets. Scope the token to this Cloudflare account and the zone, with permissions to deploy Workers, manage the custom-domain route, and apply D1 migrations. Run **Actions → Deploy Solstice Guild → Run workflow**. The workflow runs the local tests, applies pending migrations, and deploys the Worker.

## Verify with your guild

- Open the domain signed out. The guild login screen should appear and direct API requests should return 401.
- Sign in with a Solstice server member. The guild menu should open. Confirm a nonmember is refused.
- Create a raid, copy its link, and open it in a separate browser session. After Discord login, it should return to the exact raid and accept an RSVP.
- Confirm the raid creator can review the sign-up and assign a group.

Sessions expire after eight hours and Discord membership is checked again at the next sign-in. The database stores Discord user IDs, display names for active sessions, and submitted raid data. OAuth access tokens are used only for the membership check and are never stored.

The migrations create a fresh database. The existing hosted site's records and ChatGPT-linked identities are separate. Character entry is manual. Armory verification, Discord bot reminders, and in-game addon sync are outside this package.

## References

- [Cloudflare Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)
