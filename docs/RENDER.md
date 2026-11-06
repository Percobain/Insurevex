# Deploy the backend on Render

The root `render.yaml` provisions one paid Node 24 web service in Singapore with a
1 GB persistent disk mounted at `/var/data`. The frontend remains a separate
deployment. No contract redeployment is needed: ABI files and the three testnet
deployment manifests are already inside `server/`.

## Create the service

1. Publish the deployment files to the GitHub branch you want Render to use.
2. In <https://dashboard.render.com>, choose **New > Blueprint**, connect
   `Percobain/ethgmum`, select that branch, and use the root `render.yaml`.
3. Review the paid Starter service and disk charges before creating the resources.
   Persistent disks require a paid service; the Free tier is unsuitable for the
   agent's durable payment state.
4. At the environment prompts, set `CLIENT_ORIGIN` to your frontend's exact HTTPS
   origin (no trailing slash), and set `QUOTER_PRIVATE_KEY` privately to the
   existing authorized **testnet** quote signer. Never use a `NEXT_PUBLIC_` variable
   for keys. The Blueprint generates a private `KEEPER_SECRET` automatically.
5. Add any needed `WHITECHAIN_RPC`, `HEDERA_RPC`, `ARC_RPC`, or `ALCHEMY_API_KEY`
   overrides privately. The checked-in defaults are used otherwise. Do not set
   `VERCEL` on this service. Render supplies `PORT` automatically.
6. Deploy and open `https://<your-service>.onrender.com/api/health`. Expect HTTP 200,
   `ok: true`, the expected quoter address and configured testnet contracts.

Auto-deploys are off so a repository update does not unexpectedly restart an
agent payment. Deploy reviewed changes manually. A disk-backed service can have
deployment downtime; keep it at one instance with no autoscaling.

## Migrate the existing agent without losing its guardrails

The first deploy deliberately has `KEEPER=0`, `X402_ENABLED=0`, and
`AGENT_KILL_SWITCH=1`. Read APIs and quoting can run while state is migrated;
autonomous payments and scheduled keeper transactions remain off.

1. Stop new runs on the local merchant, wait for any in-flight run to finish, and
   reconcile any unknown transaction outcomes. Stop the local merchant and keeper
   before copying their files. Do not run the same wallet on both servers.
2. Using a private transfer method supported by your Render service, copy the
   **selected agent's** credentials, policy, agent/control databases and complete
   SQLite state to `/var/data/agent/`. Copy that merchant's database to
   `/var/data/merchant.sqlite`. Preserve SQLite companion files if present; a
   stopped-process copy or SQLite backup is required, not a live partial copy.
   Preserve `store.json` as `/var/data/store.json` if you need existing local KYC
   requests and keeper records. The price cache is optional.
3. Set the agent directory mode to `700` and `credentials.json` mode to `600`.
   Never commit these files, put them in a build image, paste them into chat, or
   expose them through a public download URL.
4. Change only `origin` in the migrated agent `policy.json` to the final backend
   HTTPS origin. Preserve merchant and contract pins, spending ceilings, account
   identity, HCS topic, all budget history and transaction locks. Do not run
   `npm run agent:setup` over the migrated state: that provisioning script resets
   policy limits and can issue/fund test assets.
5. In Render's service Environment settings, add:

   ```env
   X402_PUBLIC_ORIGIN=https://<your-service>.onrender.com
   X402_MERCHANT_ACCOUNT=<merchant account pinned in policy.json>
   AGENT_CONTROLLER_ADDRESS=<your browser controller wallet address>
   X402_ENABLED=1
   AGENT_KILL_SWITCH=1
   ```

6. Redeploy. Check `/api/agent/control/status`: `ready` should be true and `stopped`
   true. Confirm the wallet, budget totals and lock state match the local service.
   A pending/unknown transaction lock must be reconciled, not cleared to force a
   demo. `/api/agent/discovery` should show the final HTTPS endpoint and the pinned
   merchant. It remains disabled while the emergency stop is active.
7. Once those checks pass, set `AGENT_KILL_SWITCH=0` and remove an inherited `STOP`
   file only if the stop has been deliberately resolved. Redeploy and verify
   discovery is enabled and controller actions require the configured wallet.
   A paid test run spends test assets; check the available budget before running.
8. If this service will own oracle/settlement/coupon jobs, enable `KEEPER=1` only
   after the local keeper and any Vercel cron invoking it have been stopped.

The private keys belong in Render's private environment or protected persistent
files. Keep backups of payment state. Reverting a disk snapshot can roll back
replay protection and budgets; reconcile with the chain before resuming payments.

## Connect the frontend

Set these frontend build variables to the same backend origin, then redeploy it:

```env
NEXT_PUBLIC_API_URL=https://<your-service>.onrender.com
```

This checkout routes the agent API through `NEXT_PUBLIC_API_URL` too. No separate
agent service or port is required. Ensure the frontend's exact origin is allowed
by `CLIENT_ORIGIN`; multiple origins can be comma-separated with no spaces.

Verify the markets, quotes, Saver/Holder views and Agent page against the hosted
backend. A passing health check proves API startup, not third-party RPC health,
valid signing roles, funded wallets, or successful payment settlement.

Hosting the backend does not automatically deploy or schedule a CRE workflow.
Enable any optional integrations only after their own configuration and checks.

Sources: [Render Blueprints](https://render.com/docs/blueprint-spec),
[persistent disks](https://render.com/docs/disks), and
[Node versions](https://render.com/docs/node-version).
