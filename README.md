# Solstice Guild

A Discord-gated single-page app for World of Warcraft: Forever, US Normal Alliance. The app serves the SPA, proxies market data, and stores raid records in SQLite on Komodo or D1 on Cloudflare Workers. Navigation and browser history stay inside the SPA. GitHub stores the source and can deploy it through the included manual workflow.

## Included

- Auction House with categories and subcategories, item search, rarity colors, and Wowhead Forever tooltip links.
- Professions with recipe costs, estimated margins, ingredients, and listed materials.
- Raid creation and review, role slots, up to twelve weekly occurrences, requirements, soft reserves, optional approval and waitlists, private invite links and optional member discovery.
- Saved characters, calendar downloads, roster and group assignments, player assignments, and lock, reopen, or cancel controls.

For sign-ups, create a raid and select **Copy link**. Share that URL with guildmates. Discord sign-in brings them back to that exact raid. A link-only raid is excluded from discovery. A signed-in member of the configured Discord server who has its URL can view it and RSVP. One Discord account can RSVP with one character per raid. The organizer controls approvals and assignments.

## Deploy with Komodo

Create a **Stack** on the Docker server that should run Solstice. Set its source to Git, repository to `logicsec/solstice-guild`, branch to `main`, and Compose file to `compose.yaml`. Enable **Build** on deploy so updates rebuild the image. The Compose project uses a named volume for SQLite, so keep the same stack/project name across deployments.

Set these in the stack's environment. Store the client secret in Komodo's secret variables and reference it from the stack environment.

```dotenv
PUBLIC_ORIGIN=https://solsticeguild.net
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_solstice_discord_server_id
DISCORD_CLIENT_SECRET=your_client_secret
SOLSTICE_PORT=3000
```

Register `https://solsticeguild.net/auth/discord/callback` in the Discord application's OAuth2 redirect settings. Deploy the stack and route HTTPS for `solsticeguild.net` to the app through your existing reverse proxy or tunnel. With a proxy running directly on the same host, use `http://127.0.0.1:3000`. If the proxy runs in a container, attach the service to the proxy's Docker network and use `http://solstice:3000`, or configure a host address the proxy can reach. The default host port binds to loopback. If you change `SOLSTICE_BIND_IP`, limit access to the proxy or private network.

The container applies SQLite migrations on startup. Its health endpoint is `/healthz`. Back up the named volume using a SQLite-consistent backup or stop the stack first. This is a single-instance deployment. Existing Cloudflare D1 data is separate and is not imported by this stack.

[Komodo Compose stack documentation](https://komo.do/docs/deploy/compose)

## Alternative deployment with Cloudflare Workers

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

The first deployment creates a fresh database. The existing hosted site's records and ChatGPT-linked identities are separate.

## References

- [Cloudflare Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)

## Guild Chronicle

The homepage and published articles are public. Guild Hall, market data and raid tools still require Discord login. To enable the article editor, set `CMS_ADMIN_DISCORD_IDS` to a comma-separated list of Discord **user** IDs in the Komodo stack environment. With Developer Mode enabled, right-click your Discord profile and select **Copy User ID**. This is separate from the Discord server ID.

Redeploy the stack to apply the migration and environment setting. Sign in, then select **Article editor** on the homepage or go to `/cms`. Drafts are visible only in the editor. Publishing adds the article to the homepage and gives it a shareable link. Saving a published article as a draft takes it offline. Articles support plain text with blank lines between paragraphs.


## Armory and raid preparation

To enable Armory search for US WoW Forever, set `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` in Komodo, using a secret variable for the secret. For a Worker deployment, configure the same names as Worker secrets. In **My characters**, search by first name and surname and choose **Link to Discord**. The link is self-reported. Profiles are retrieved on demand and may include a static character render, equipment, enchants, and professions. The guild stores the character link and basic signup fields.

In **Tonight**, choose a raid, confirm attendance, and enter the time available. The organizer can add individual tasks, profession work, and five-player runs, then confirm materials and prerequisites for each task. The planner schedules the confirmed tasks that fit, explains skipped tasks, and generates a copyable Discord message. Reported completion is recorded separately from readiness reviews.

## Raid Logs

Raid Dashboard → Logs links one public Warcraft Logs report to the selected Working Raid. The raid organizer can link or replace the report; signed-in guild members can review it. Configure `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET` in the deployment environment using a Warcraft Logs OAuth client. Credentials and access tokens stay server-side. Public reports use the client-credentials flow; private-report OAuth is not implemented. No Discord permission changes are needed.

The view shows completed boss pulls, confirmed kill/wipe outcomes, combat time, full-pull DPS/HPS/DTPS, interrupts, dispels, and a player-death timeline. Missing metrics display as unavailable. Death timelines indicate truncation. Damage taken is not labeled avoidable damage, and no percentile parses are invented. Metadata and pull analytics are cached for ten minutes to reduce API quota usage; changing pulls loads only the selected pull. Live/in-progress encounters are excluded until complete.
