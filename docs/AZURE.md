# Azure backend deployment

The backend is hosted on a dedicated Ubuntu 24.04 Azure VM, using the subscription's
existing Azure CLI login. The Render configuration remains an alternative recipe;
no Render service was provisioned.

| Resource | Value |
| --- | --- |
| API origin | `https://insurevex-api-30d9bd1c.centralindia.cloudapp.azure.com` |
| Health check | `/api/health` |
| Resource group | `insurevex-rg` |
| VM | `insurevex-api` |
| Region | Central India |
| Size | `Standard_B2als_v2` (2 vCPU, 4 GiB RAM) |
| OS disk | 32 GiB managed Standard SSD |
| Static public IP | `40.80.81.213` |
| Runtime | Node 24, Docker Compose, one API instance |

Azure's retail API returned USD 0.0246/hour for this VM's Linux consumption compute
at provisioning (about USD 18 for 730 hours). Disk, public IP and bandwidth are
additional. Actual billing depends on the subscription's credit and pricing.

## Runtime and state

`server/Dockerfile` explicitly copies application code, ABI/deployment manifests,
and `data/engine.json`. The Docker build context excludes local `.env` files,
credentials and payment databases. The API runs as the unprivileged Node user,
with a read-only container filesystem and a private writable `/data` mount.

- Source on VM: `/home/azureuser/insurevex`.
- Private backend settings: `/etc/insurevex/backend.env` (mode `600`).
- Public hostname setting: `/etc/insurevex/public.env`.
- Durable data: `/srv/insurevex/data`, on the managed OS disk, mounted at `/data`.
- Agent credentials and policy: `/srv/insurevex/data/agent/`, directory mode `700`,
  credentials mode `600`.
- Agent, controller and merchant SQLite databases retain their original payment
  history, limits, reservations and replay records. The databases were copied
  using SQLite's backup API with integrity checks.
- Caddy certificate data: `/srv/insurevex/caddy-data` and `caddy-config`.

These host directories survive container recreation and VM restart. Deleting or
reimaging the disk can destroy them. A managed persistent disk is not a backup;
preserve private backups and reconcile on-chain transactions before restoring
older payment state. Do not place SQLite on an ephemeral or shared network mount.

Caddy serves HTTPS with automatic certificate renewal. Only ports 80 and 443 are
public. SSH is restricted by the network security group to the operator IP at
provisioning. API port 8080 is available only on Docker's internal network.
The public health check contains public contract/signer information, not secrets.

## Agent handover and keeper status

The migrated agent's origin is the Azure HTTPS origin; its merchant, contract
allowlists, identity, HCS topic and spending ceilings were preserved. The local
`server/.agent-state/STOP` file prevents the old local wallet from spending while
the hosted agent is active. Do not remove it and run both copies of the wallet.
The hosted x402 merchant and signed controller are enabled. Existing budget
constraints and reservations still apply; deployment does not reset them.

**`KEEPER=0` on Azure.** Automatic oracle, settlement, coupon and NAV jobs have not
been activated on the VM, because the existing local keeper and old Vercel cron
were not handed over. The authenticated keeper endpoint remains available. Before
turning on the hosted keeper, stop the other schedulers, reconcile their latest
state, update the private env file to `KEEPER=1`, then recreate the API container.
Do not run multiple schedulers with the same signer.

Hosting this API does not deploy or schedule a CRE workflow.

## Connect the existing frontend

The documented frontend at `https://insurevex-app.vercel.app` is live, but its
deployment is not accessible to the currently logged-in Vercel account. Its
existing deployment was left unchanged. In the **owning** Vercel project, set:

```env
NEXT_PUBLIC_API_URL=https://insurevex-api-30d9bd1c.centralindia.cloudapp.azure.com
```

Then redeploy that frontend. This checkout uses the same API base for the Agent
page. Backend CORS currently permits that frontend and `http://localhost:3000`.
If the actual frontend uses another origin, update `CLIENT_ORIGIN` in the VM's
private environment file, then recreate the API container.

## Operations

SSH uses the dedicated local key `~/.ssh/insurevex_azure`:

```sh
ssh -i ~/.ssh/insurevex_azure azureuser@40.80.81.213
cd /home/azureuser/insurevex/deploy/azure
sudo docker compose --env-file /etc/insurevex/public.env ps
sudo docker compose --env-file /etc/insurevex/public.env logs --tail 50 api
```

After uploading reviewed source changes, rebuild and recreate the API:

```sh
sudo docker compose --env-file /etc/insurevex/public.env up -d --build api
```

Changing an environment file requires container recreation (`up -d`); a plain
`restart` does not reload environment values. Stop new agent runs and reconcile
any active/unknown transactions before a deployment. Docker's restart policy
restores services after a host reboot; do not scale the API to multiple instances.

To pause new payments, set `AGENT_KILL_SWITCH=1` privately and recreate the API,
or create `/srv/insurevex/data/agent/STOP`. Stopping the VM without deallocating it
does not necessarily stop compute billing. To stop compute billing deliberately:

```sh
az vm deallocate --resource-group insurevex-rg --name insurevex-api
```

This takes the API offline; disk and static IP charges can continue. Restart with
`az vm start --resource-group insurevex-rg --name insurevex-api`.

Verification evidence: [Azure deployment checks](evidence/azure-deployment.json).
No new payment or insurance transaction was broadcast as part of hosting checks.

Sources: [Azure Linux VMs](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-cli),
[persistent managed disks](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/faq),
[Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/), and
[Caddy HTTPS](https://caddyserver.com/docs/automatic-https).
