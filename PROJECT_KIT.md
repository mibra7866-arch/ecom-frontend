# PROJECT_KIT.md — MyESellerStore (ECom) Deployment & Maintenance Kit

> **Read this file before doing any deployment, infrastructure, or "how does this get to production" work.**
> It exists so a developer or AI coding agent can pick up this project cold and deploy/maintain it without
> being told the server, Git, SSH, or environment details again.

Last verified: 2026-09-06, by an AI coding session that performed the deploys described below directly.

---

## 0. Repository Topology — READ THIS FIRST

**This project is TWO separate Git repositories, not one monorepo.** They are developed and deployed
independently, and they live as sibling folders on both the local machine and the production server.

| Repo | Local path (this machine) | Remote |
|---|---|---|
| Backend (.NET API) | `C:\ECom\ECom` | `https://github.com/Mubeendharejo-dev/ECom.git` |
| Frontend (Angular) | `C:\ECom\ecom-frontend` | `https://github.com/Mubeendharejo-dev/ecom-frontend.git` |

Both remotes use branch **`master`** as the production branch (no `develop`/staging branch exists — every
push to `master` is what gets pulled and deployed).

Because there are two repos, **this same `PROJECT_KIT.md` file is committed to the root of both repos**
(`C:\ECom\ECom\PROJECT_KIT.md` and `C:\ECom\ecom-frontend\PROJECT_KIT.md`) with identical content, so
whichever repo you clone first, you have the full picture. If you update one copy, update the other to
match (see §23).

There is also a loose, **not-currently-tracked-by-either-repo** test project at `C:\ECom\ECom.Tests`
(xUnit, covers password-reset endpoints) sitting as a sibling folder outside both repo roots. It is not in
`ECom.slnx`. This is a known gap — see §2.

---

## 1. Project Overview

- **Project name:** MyESellerStore (product/brand name; internal repo names are `ECom`/`ecom-frontend`)
- **Purpose:** A dropshipping-style reseller marketplace. Admins manage sellers, KYC, orders, top-ups,
  withdrawals, invitation codes ("LLC Codes"), and chat support. Sellers manage their own store, products,
  orders, balance top-ups/withdrawals, and KYC.
- **Application type:** SPA frontend + REST/SignalR API backend, two-portal design (Admin Portal, Seller
  Portal) served from one Angular app with role-based routing.
- **Frontend:** Angular ^22 (standalone components, signals, Angular Material), TypeScript ~6.0.2, built
  with the Angular CLI (esbuild/Vite-based dev server).
- **Backend:** .NET 10 (ASP.NET Core Web API), Entity Framework Core (SQL Server provider), SignalR
  (`ChatHub`) for realtime (chat, notifications, live order/balance updates), FluentValidation for request
  validation, BCrypt.Net for password hashing, JWT bearer auth (access + refresh token, refresh via
  httpOnly cookie).
- **Database:** Microsoft SQL Server 2022, running in a Docker container in production; SQL Server
  LocalDB (`(localdb)\mssqllocaldb`) for local development.
- **Package managers:** npm (frontend, pinned `packageManager: npm@11.17.0` in `package.json`); NuGet /
  `dotnet` CLI (backend).
- **Required runtime versions:**
  - .NET SDK 10.0.x (`TargetFramework` = `net10.0`)
  - Node.js compatible with Angular CLI ^22 (Node 20 LTS or newer recommended) + npm 11.x
- **Key backend dependencies:** `Microsoft.EntityFrameworkCore.SqlServer`, `AutoMapper` (⚠ has a known
  NU1903 advisory — see §18), `BCrypt.Net`, `FluentValidation.AspNetCore`, `Microsoft.AspNetCore.SignalR`.
- **Key frontend dependencies:** `@angular/core` ^22.1, `@angular/material`, `@angular/cdk`,
  `@microsoft/signalr`.

### High-level architecture

```
User (browser)
  ↓ HTTPS
Domain (myesellerstore.online)
  ↓
Nginx (reverse proxy + static file server)
  ├─→ Angular static build  (/opt/ecom/web)              — served directly by Nginx
  └─→ ASP.NET Core Kestrel  (proxied, backend on localhost) — /api/*, /hubs/*, /uploads/*
        ↓
      SQL Server 2022 (Docker container "ecom-sql", 127.0.0.1:1433 only — not publicly exposed)
        ↓
      Local disk file storage (/opt/ecom/uploads/{category}/{ownerId}/…) — chat, KYC, top-up receipts, etc.
```

There are no external third-party services wired in beyond outbound email (SMTP, currently blank in
tracked `appsettings.json` — see §8) and the domain's own SSL certificate.

---

## 2. Complete Project Structure

### Backend — `C:\ECom\ECom`

```
ECom/
├── Controllers/        REST endpoints, one per feature area (AdminXController, SellerXController)
├── DTOs/                Request/response records, grouped by feature folder (Admin/, Sellers/, Chat/, …)
├── Data/                AppDbContext (EF Core), global query filters (soft-delete via IAuditable)
├── Hubs/                ChatHub (SignalR) — chat + app-wide realtime notifications/order/balance pushes
├── Migrations/           EF Core migrations (source of truth for schema changes)
├── Models/               EF entities + enums (Enums.cs)
├── Repositories/         One repository (+ interface) per aggregate; thin data-access layer over AppDbContext
├── Services/              Business/infra services (JWT/TokenService, file storage, notifications, auth)
├── Validators/            FluentValidation validators, auto-run on model binding
├── Properties/
│   └── launchSettings.json   Local dev URLs (see §3) — do NOT rely on this for production
├── appsettings.json       Tracked in git — placeholder/empty secret values only (safe)
├── appsettings.Development.json   Local secrets — gitignored, never committed
├── ECom.csproj / ECom.slnx
└── wwwroot/               Local-dev-only file storage root when Storage:UploadsPath is unset
```

**Is it safe to modify?** Controllers/DTOs/Repositories/Services/Validators are the normal day-to-day
change surface. `Migrations/` should only ever be **added to**, never hand-edited after being applied
anywhere (see §9, §14). `Data/AppDbContext.cs`'s global query filter loop (soft-delete via `IAuditable`)
is foundational — changing it affects every entity that implements `IAuditable`.

### Frontend — `C:\ECom\ecom-frontend`

```
ecom-frontend/
├── src/
│   ├── app/
│   │   ├── admin/         Admin Portal feature pages (sellers, kyc, orders, topup, withdrawals, chat, profile, dashboard, shell)
│   │   ├── seller/         Seller Portal feature pages (home/profile, products, orders, topup, withdraw, chat, dashboard, shell, login/signup)
│   │   ├── core/
│   │   │   ├── models/      TS interfaces mirroring backend DTOs
│   │   │   └── services/    HTTP/SignalR services (one per feature area), TokenService, ApiService
│   │   └── shared/          Reused standalone components (modals, chat-thread, file-upload, status-badge, styles/)
│   ├── environments/
│   │   ├── environment.ts               Production build values (relative /api, no secrets)
│   │   └── environment.development.ts   Local dev values — points at https://localhost:44303 (see §3)
│   └── styles.scss           Global design tokens (--ecom-* CSS custom properties), global utility classes
├── public/                  Static assets copied as-is (favicon, fonts)
├── angular.json / package.json / tsconfig*.json
└── README.md                 Default Angular-CLI-generated README (not a deployment doc — use this file instead)
```

**Is it safe to modify?** `src/app/**` is the normal change surface. `src/environments/*.ts` control which
API host the app talks to — editing `environment.ts` (the production one) changes what gets baked into
every production build; treat it like an infra file, not routine app code.

### Application modules that actually exist (do not assume others)

- **Admin Portal**: Dashboard, Sellers (list/detail/actions), KYC Review, Products, Orders (list, assign,
  create-for-seller, stages), Top-Up Requests, Withdrawals, Chat, Admin Profile (incl. Bank Accounts and
  E Vault — see below), Invitation Codes ("LLC Codes"), Admins management.
- **Seller Portal**: Dashboard, Products (catalog), Orders, Top Up (Bank/E Vault selector →
  bank-transfer-style request), Withdraw, Chat, Profile (incl. Bank Details, KYC submission/resubmission,
  password/transaction-password).
- **Authentication**: JWT access token + refresh token (httpOnly cookie), role claim = `Admin` or `Seller`
  (a third pseudo-role, `PreLoginChat`, is used only for the unauthenticated "chat with support" widget on
  the seller login page).
- **Bank Account / E Vault**: One shared backend table (`AdminBankAccounts`) holds both an admin's bank
  accounts and E Vault accounts, distinguished by a `BankAccountType` (`Bank`/`EVault`) column — each type
  keeps an independent "default" flag. Sellers only ever see `Bank`-type accounts (E Vault has no
  seller-facing data source yet, only Admin-side management).
- **Top Up / Withdrawal**: Seller submits a request + receipt; Admin reviews (Approve/Reject) from a
  status-filtered queue.
- **Chat**: One shared `ChatHub` (SignalR) connection handles chat AND live order/balance/notification
  pushes app-wide.

Do not assume a "Payments" module, "CI/CD", or "Digital Vault" exist — none of these are present (a
"Digital Vault" concept existed at one point and was removed via migration
`20260812100437_RemoveDigitalVaultAndAddKycIdPaths`; "E Vault" today is unrelated to that removed feature).

---

## 3. Local Development Setup

### Required software

- .NET SDK 10.0.x
- Node.js + npm 11.x (`npm install -g npm@11` if your global npm is older)
- SQL Server LocalDB (ships with Visual Studio, or install "SQL Server Express LocalDB" standalone)
- (Optional) SQL Server Management Studio / Azure Data Studio for inspecting the local DB

### Backend

```bash
cd C:\ECom\ECom
dotnet restore
dotnet build
```

Local secrets live in `appsettings.Development.json` (gitignored — copy the shape from `appsettings.json`
and fill in a local `Jwt:Secret` — any random base64 string — and `ConnectionStrings:Default`, e.g.
`Server=(localdb)\mssqllocaldb;Database=ECom;Trusted_Connection=True;MultipleActiveResultSets=true`).

Apply migrations to your local DB:

```bash
dotnet ef database update
```

Run the API:

```bash
dotnet run
```

⚠️ **Port discipline**: `Properties/launchSettings.json` defines two profiles — the default `https`
profile binds `7091`/`5234`, but the frontend's `environment.development.ts` expects the backend at
**`https://localhost:44303`** (the IIS Express profile's SSL port). If you need the frontend to talk to a
locally-running backend, run it bound to that port explicitly:

```bash
dotnet run --urls "https://localhost:44303"
```

**Always stop this process when you're done** — if the developer normally runs the API via Visual
Studio's IIS Express (which also claims port 44303), a leftover `dotnet run` will collide with it.

### Frontend

```bash
cd C:\ECom\ecom-frontend
npm install
npm start          # ng serve, http://localhost:4200
```

Other scripts (from `package.json`):

```bash
npm run build      # ng build (production config by default per angular.json)
npm run watch       # ng build --watch --configuration development
npm test            # ng test
```

Production build for deployment specifically:

```bash
npx ng build --configuration production
```

Output lands in `dist/ecom-frontend/browser/`.

### Backend tests

A test project exists at `C:\ECom\ECom.Tests` (xUnit, covers password-reset endpoints via
`CustomWebApplicationFactory`) but **is not part of either git repo or the `.slnx` solution file** — it's
untracked. To run it as-is:

```bash
cd C:\ECom\ECom.Tests
dotnet test
```

This should probably be brought into the backend repo and solution properly; flagged here, not fixed as
part of this documentation pass.

### Docker

No `docker-compose.yml` exists in either repo. The only container in this project's world is the
production SQL Server container (`ecom-sql`, started by a direct `docker run`, not from a checked-in
compose file — see §9). There is no local-dev Docker setup; local dev uses LocalDB.

---

## 4. Git Repository & Branch Strategy

| | Backend | Frontend |
|---|---|---|
| Provider | GitHub | GitHub |
| Repository | `Mubeendharejo-dev/ECom` | `Mubeendharejo-dev/ecom-frontend` |
| Remote URL | `https://github.com/Mubeendharejo-dev/ECom.git` | `https://github.com/Mubeendharejo-dev/ecom-frontend.git` |
| Default/production branch | `master` | `master` |
| Feature branches | None in use — all work happens directly on `master` | Same |
| Remote name | `origin` | `origin` |

**Workflow in practice:** commit directly to `master` locally, push to `origin/master`, then deploy (§13)
by pulling that same `master` branch on the server. There is no CI/CD pipeline — deployment is a manual
SSH-driven process (see §13). There are no Git hooks or automated deployment triggers; a push to GitHub
does **not** by itself deploy anything.

**How the server gets code:** the server has its own clone of each repo (see §5) and pulls from GitHub
over SSH using dedicated deploy keys (§6, §7) — not HTTPS, and not the same key as your local machine's
key.

---

## 5. Server Documentation

```
Provider:        <PROVIDER — not recorded this session; check hosting account>
Server IP:       187.77.150.88
Operating system: Ubuntu 26.04 LTS (kernel 7.0.0, hostname srv1930916; Nginx build string observed: "nginx/1.28.3 (Ubuntu)")
SSH port:        22 (default — not overridden)
SSH user (deploy/admin): root
```

**OS package updates:** `unattended-upgrades` is installed and enabled (`apt-daily-upgrade.timer`,
systemd, runs daily). Scope is **security updates only** (`/etc/apt/apt.conf.d/20auto-upgrades` has both
`Update-Package-Lists` and `Unattended-Upgrade` set to `"1"`) — routine `-updates`-pocket packages (seen
this session: Docker CE, grub, various libs) are deliberately left for manual review via
`apt list --upgradable`, so a routine bump can't silently restart nginx/Docker/etc. mid-shift. To also
auto-apply routine updates, uncomment the `${distro_id}:${distro_codename}-updates` origin line in
`/etc/apt/apt.conf.d/50unattended-upgrades`.

**Note on remote access:** SSH (port 22) and HTTPS (port 443) to this server were unreachable (TCP
connection timeout) from at least one AI-agent working environment during a 2026-09-07 session, while the
server's own `sshd`/`ufw` were confirmed healthy and general outbound internet access from that same
environment worked fine (GitHub, Google reachable) — pointing at a block somewhere upstream (provider
firewall/security-group, or an IP-range flag) rather than the server's own OS config. A reboot did not
clear it. If a deploy agent can't reach the server, this is a known possibility — fall back to running the
deploy commands directly on the server's own console (see §13) rather than assuming credentials or server
config are wrong.

**Application paths on the server:**

```
/opt/ecom/
├── src/
│   ├── backend/      Backend git clone (git remote → GitHub via deploy key)
│   └── frontend/     Frontend git clone (git remote → GitHub via deploy key)
├── api/              Live deployed backend (published .NET output) — what ecom-api.service runs
├── api.old/           Previous backend build, kept as a rollback snapshot (see §14)
├── web/               Live deployed frontend static files — what Nginx serves
├── web.old/            Previous frontend build, kept as a rollback snapshot (see §14)
└── uploads/            User-uploaded files (chat photos, KYC docs, receipts, product images) — persists across deploys, NOT inside api/ or web/
```

**Running services:** `ecom-api` (systemd, backend), `nginx` (reverse proxy + static hosting), a Docker
daemon running the `ecom-sql` container (database).

**Ports:** 443 (HTTPS, public), 80 (HTTP → likely redirects to 443, not directly confirmed this session),
22 (SSH, public). The backend's own Kestrel port and the SQL Server container's port (1433) are **not**
publicly exposed — SQL Server is explicitly bound to `127.0.0.1:1433` only.

**Firewall:** not inspected this session — verify with `ufw status` (or equivalent) directly on next
server access before assuming what's open.

---

## 6. SSH Configuration

```
SSH Host:            187.77.150.88
SSH Port:             22
SSH User:              root
Local private key:    ~/.ssh/ecom_deploy   (ed25519 — used from the developer/deploy machine)
Server authorized_keys: root's ~/.ssh/authorized_keys on 187.77.150.88 (the above key's public half is installed there)
```

Connect with:

```bash
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88
```

### Security

**Never place actual private SSH keys in either repository.** No `.pem`, `.key`, private key material,
passwords, tokens, or certificates containing private material should ever be committed. This kit
documents key **locations and purpose only** — the key files themselves live outside both repos, on the
machines that need them (developer's local `~/.ssh/`, server's `/root/.ssh/`).

---

## 7. Git Deployment Keys

The server does **not** reuse the admin SSH key (§6) to pull from GitHub — each repo has its own
dedicated deploy key on the server, referenced explicitly via `GIT_SSH_COMMAND` rather than the default
SSH config, so a compromised deploy key can't be used for anything beyond pulling that one repo.

| | Backend | Frontend |
|---|---|---|
| Deploy key path (on server) | `/root/.ssh/ecom_deploy_key` | `/root/.ssh/ecom_deploy_key_frontend` |
| Repository | `Mubeendharejo-dev/ECom` | `Mubeendharejo-dev/ecom-frontend` |
| Permissions | Read (pull-only is sufficient; confirm on GitHub's Deploy Keys settings for each repo) | Read |
| Branch pulled | `master` | `master` |

Pull command pattern used for deployment (see §13):

```bash
cd /opt/ecom/src/backend && GIT_SSH_COMMAND='ssh -i /root/.ssh/ecom_deploy_key' git pull origin master
cd /opt/ecom/src/frontend && GIT_SSH_COMMAND='ssh -i /root/.ssh/ecom_deploy_key_frontend' git pull origin master
```

Never expose the private key material of either deploy key.

---

## 8. Environment Variables & Secrets

### Backend — `appsettings.json` shape (tracked, values intentionally blank)

| Key | Purpose | Required | Where configured |
|---|---|---|---|
| `ConnectionStrings:Default` | SQL Server connection string | Yes | `appsettings.Development.json` locally (gitignored); production env file on server |
| `Jwt:Secret` | Base64 HMAC signing key for access/refresh tokens | Yes | Same as above |
| `Jwt:Issuer` / `Jwt:Audience` | JWT validation — currently `"ECom"` / `"ECom.Clients"` (not secret, safe as committed) | Yes | `appsettings.json` (already tracked, non-secret) |
| `Jwt:AccessTokenMinutes` / `Jwt:RefreshTokenDays` | Token lifetimes | Yes | `appsettings.json` (already tracked, non-secret) |
| `Email:Host` / `Port` / `Username` / `Password` | Outbound SMTP (currently blank — email sending is not actively configured) | No (blank = disabled) | Local/production env config |
| `Storage:UploadsPath` | Where uploaded files are written; production points this outside `api/` so uploads survive redeploys (§5's `/opt/ecom/uploads`) | No (falls back to `wwwroot/uploads`) | Production env config |
| `MSSQL_SA_PASSWORD` | SQL Server container's `sa` password (Docker container env var, not an app setting) | Yes | Docker container environment only |

**Local dev:** secrets live in `appsettings.Development.json`, which is **gitignored** (`.gitignore`
excludes `appsettings.*.json` except `appsettings.json` itself, which is why the tracked one is safe to
commit with blank values).

**Production:** the server does **not** use `appsettings.Production.json`. Config is supplied via an
environment file at `/etc/ecom/ecom-api.env`, consumed both by the running `ecom-api` systemd service and
by the `/root/run-ef.sh` migration helper (§9, §12). The exact variable names in that file were not
re-verified this session (server was unreachable at documentation time — see §24) — treat the table above
as the authoritative list of keys the app actually reads, and confirm the env file matches on next server
access.

**Frontend:** no secrets at all. `src/environments/*.ts` hold only API base URLs (`apiUrl`, `hubUrl`,
`chatHubUrl`, `filesBaseUrl`) — no API keys, no credentials. This is why the frontend `.gitignore` has no
env-file exclusions; there's nothing secret to exclude.

### Rotation procedure

Not formally documented/scripted anywhere in this project today. To rotate `Jwt:Secret`: update
`/etc/ecom/ecom-api.env` on the server and restart `ecom-api` — note this immediately invalidates every
existing access/refresh token (all users get logged out). To rotate the SQL `sa` password: requires
recreating or reconfiguring the `ecom-sql` container and updating `/etc/ecom/ecom-api.env` in lockstep, or
every request will start failing — do this only with a maintenance window.

---

## 9. Database

```
Type:              Microsoft SQL Server 2022
Image:              mcr.microsoft.com/mssql/server:2022-latest
Container name:      ecom-sql
Bind:                127.0.0.1:1433 (not publicly reachable)
Database name:       ECom
Auth:                 SQL auth, user "sa", password in the container's MSSQL_SA_PASSWORD env var (never print this value)
Migration system:     EF Core Migrations (Migrations/ folder in the backend repo)
```

**Run migrations locally:**

```bash
cd C:\ECom\ECom
dotnet ef database update
```

**Add a new migration after model changes:**

```bash
dotnet ef migrations add <DescriptiveName>
```

**Apply migrations in production** — via the pre-existing helper script (do **not** run raw `dotnet ef`
against production without it, since it's what wires up the right connection string):

```bash
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 "/root/run-ef.sh database update"
```

`/root/run-ef.sh` sources `/etc/ecom/ecom-api.env` and then runs `dotnet ef "$@"` from
`/opt/ecom/src/backend` — so it needs the backend repo on the server (`/opt/ecom/src/backend`) already
pulled to the commit containing the migration you're applying, **before** you run it.

**Ad-hoc production queries** (for diagnostics, not routine use) go through the container directly:

```bash
docker exec ecom-sql bash -c '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -d ECom -Q "<query>"'
```

Note `sqlcmd` lives at `/opt/mssql-tools18/bin/sqlcmd` inside the container (not on PATH), and `-C` (trust
server certificate) is required. Never echo `$MSSQL_SA_PASSWORD` directly — the pattern above references
it opaquely inside the container's own shell.

**Backups:** see §15 — **not configured**.

**No password values are included anywhere in this document.**

---

## 10. Nginx / Reverse Proxy

```
Web server:    Nginx (version observed: 1.28.3, Ubuntu build)
Domain:         myesellerstore.online
```

Nginx serves the built Angular app directly from `/opt/ecom/web` and reverse-proxies API/SignalR/upload
traffic to the backend. The exact config file path and full proxy rules were **not re-inspected this
session** (server was unreachable at the time this file was written — see §24). Based on the deployment
paths already established:

- Static frontend root: `/opt/ecom/web`
- Reverse-proxied to the backend (Kestrel, localhost-only): `/api/*`, `/hubs/*` (SignalR), `/uploads/*`
  (though `/uploads` may instead be served directly by the backend's own static-file middleware — both
  are architecturally plausible; confirm against the live config file next time you're on the box)
- Config location: typically `/etc/nginx/sites-available/<name>.conf` symlinked into
  `/etc/nginx/sites-enabled/` on Ubuntu — verify the exact filename with `ls /etc/nginx/sites-enabled/`

**Reload/restart after any Nginx config change:**

```bash
nginx -t && systemctl reload nginx
```

---

## 11. SSL / HTTPS

```
Domain:    myesellerstore.online
```

The site serves over HTTPS successfully (confirmed repeatedly this session). Certificate provider/renewal
mechanism was **not directly re-verified this session** — the common pairing for Nginx + Ubuntu is
Let's Encrypt via Certbot with a systemd timer/cron auto-renewal; confirm with:

```bash
certbot certificates
systemctl status certbot.timer   # or: crontab -l | grep certbot
```

Never store private certificate keys in either Git repository.

---

## 12. Process Manager

```
Manager:            systemd
Service name:        ecom-api
Working directory:    /opt/ecom/api
Unit file (typical):  /etc/systemd/system/ecom-api.service (not re-inspected this session, see §24)
```

**Commands:**

```bash
systemctl status ecom-api
systemctl stop ecom-api
systemctl start ecom-api
systemctl restart ecom-api
journalctl -u ecom-api -n 50 --no-pager     # recent logs
journalctl -u ecom-api -f                   # follow live
```

The frontend has no process manager — it's static files served by Nginx, nothing to start/stop/restart
beyond Nginx itself.

---

## 13. Complete Deployment Procedure

Two independent deploys — do the backend first if a change touches both (so the API is ready before the
new frontend build might call it), otherwise either order is fine.

### Backend deploy

```bash
# 1. Pull latest code
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 \
  "cd /opt/ecom/src/backend && GIT_SSH_COMMAND='ssh -i /root/.ssh/ecom_deploy_key' git pull origin master"

# 2. Publish a fresh build to a staging path (does not touch the live app yet)
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 \
  "cd /opt/ecom/src/backend && dotnet publish -c Release -o /tmp/ecom-api-new"

# 3. If this change includes a new EF Core migration, apply it BEFORE swapping the build in
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 "/root/run-ef.sh database update"

# 4. Swap the build into place and restart
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 '
  set -e
  systemctl stop ecom-api
  rm -rf /opt/ecom/api.old
  mv /opt/ecom/api /opt/ecom/api.old
  mv /tmp/ecom-api-new /opt/ecom/api
  chown -R ecomapp:ecomapp /opt/ecom/api
  systemctl start ecom-api
  sleep 2
  systemctl is-active ecom-api
'

# 5. Verify
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 "journalctl -u ecom-api -n 20 --no-pager"
curl -sk -o /dev/null -w "%{http_code}\n" https://myesellerstore.online/
```

### Frontend deploy

```bash
# 1. Pull latest code
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 \
  "cd /opt/ecom/src/frontend && GIT_SSH_COMMAND='ssh -i /root/.ssh/ecom_deploy_key_frontend' git pull origin master"

# 2. Build
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 \
  "cd /opt/ecom/src/frontend && npx ng build --configuration production"

# 3. Swap into place
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 '
  set -e
  rm -rf /opt/ecom/web.old
  mv /opt/ecom/web /opt/ecom/web.old
  mv /opt/ecom/src/frontend/dist/ecom-frontend/browser /opt/ecom/web
  chown -R www-data:www-data /opt/ecom/web
'

# 4. Verify
curl -sk -o /dev/null -w "%{http_code}\n" https://myesellerstore.online/
curl -sk https://myesellerstore.online/ | grep -o '<title>[^<]*</title>'
```

### Pre-flight (do this locally before either deploy)

```bash
git status
git branch --show-current      # confirm you're on master
```

Backend: `dotnet build` (and `dotnet ef migrations add …` first if the model changed) — never push a
migration you haven't applied locally and confirmed against local data first.

Frontend: `npx tsc --noEmit` and `npx ng build --configuration production` locally — confirm zero errors
before pushing, since the server-side build step (§13 above) is the same command and will fail the same
way if there's a real error.

**Do not include destructive commands in routine deploys.** The swap-and-backup pattern above (`*.old`
folders) is the safety net — see §14 for using them.

---

## 14. Rollback

Both deploy paths keep exactly **one** previous build as a same-server backup — enough for "the last
deploy broke something, revert now," not a full version history.

### Backend rollback

```bash
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 '
  set -e
  systemctl stop ecom-api
  rm -rf /opt/ecom/api.broken   # optional: keep the bad build for inspection instead of deleting
  mv /opt/ecom/api /opt/ecom/api.broken
  mv /opt/ecom/api.old /opt/ecom/api
  systemctl start ecom-api
'
```

### Frontend rollback

```bash
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 '
  set -e
  mv /opt/ecom/web /opt/ecom/web.broken
  mv /opt/ecom/web.old /opt/ecom/web
'
```

### To go further back than one version

Use Git directly: find the commit you want (`git log --oneline` in the relevant server-side clone under
`/opt/ecom/src/`), `git checkout <commit>` (or `git reset --hard <commit>` if you're certain — see the
destructive-command warnings in this project's general safety rules), then re-publish/re-build following
§13 from step 2 onward.

### ⚠️ Database migrations and rollback

**EF Core migrations are not automatically reversible in this project's rollback flow.** Rolling back the
*application code* does not roll back the *database schema*. If a deploy included a migration:

- Rolling back the app to pre-migration code while the DB already has the new columns/tables is usually
  safe (old code just ignores new columns) **unless** the migration also transformed/deleted data.
- To actually revert a migration: `dotnet ef migrations remove` (only if it was never applied anywhere) or
  write/run a new "down" migration — never hand-edit a migration that's already been applied to production.
- Always check what a migration actually did (`Migrations/<timestamp>_<Name>.cs`) before assuming rollback
  is safe.

---

## 15. Backup & Restore

```
Backup Status: NOT CONFIGURED
```

No automated database backup, file/upload backup, or scheduled snapshot system was found anywhere in
either repository or observed on the server during this session. `/opt/ecom/uploads` (user-uploaded files)
and the `ecom-sql` container's data volume are both single points of failure today.

**Manual backup (until a real system exists), for reference:**

```bash
# Database — ad-hoc .bak dump via sqlcmd/BACKUP DATABASE, or docker volume snapshot of ecom-sql's data volume
# Uploads — tar/rsync /opt/ecom/uploads to off-server storage
```

Do not claim these run on a schedule — they don't, unless someone sets that up and updates this section.

---

## 16. Logs & Monitoring

| Source | Command |
|---|---|
| Backend application logs | `journalctl -u ecom-api -n 100 --no-pager` / `journalctl -u ecom-api -f` |
| Nginx access/error logs | `tail -f /var/log/nginx/access.log` / `/var/log/nginx/error.log` (standard Ubuntu paths — confirm exact filenames if a custom vhost log path was configured) |
| SQL Server (container) logs | `docker logs ecom-sql` / `docker logs -f ecom-sql` |
| System logs | `journalctl -xe` |

No external monitoring/alerting tool (Sentry, Datadog, etc.) was found configured in either repo.

---

## 17. Troubleshooting

**Site unavailable (nothing loads)**
- Possible cause: Nginx down, server down/unreachable, DNS issue.
- Check: `curl -sk -o /dev/null -w "%{http_code}\n" https://myesellerstore.online/` from another network;
  `systemctl status nginx` on the server (if reachable).
- Fix: `systemctl restart nginx`; if the server itself is unreachable over SSH, this is a hosting-provider
  issue, not an application issue.
- Verify: the curl above returns `200`.

**502 Bad Gateway**
- Possible cause: `ecom-api` is down or not listening on the port Nginx expects.
- Check: `systemctl status ecom-api`, `journalctl -u ecom-api -n 50`.
- Fix: `systemctl restart ecom-api`; if it won't start, check the log for a startup exception (often a
  bad/missing env var — see §8).
- Verify: `systemctl is-active ecom-api` returns `active`, and API calls through the site succeed.

**API errors (5xx from `/api/...`)**
- Possible cause: unhandled exception, DB connection failure, missing config.
- Check: `journalctl -u ecom-api -n 100` for the stack trace.
- Fix: depends on the exception — see "Database connection failure" / "Missing environment variables"
  below if that's the root cause.
- Verify: repeat the failing request.

**Application stopped / won't stay running**
- Check: `journalctl -u ecom-api -n 100` for a crash-on-startup exception.
- Fix: most commonly a bad connection string or missing `Jwt:Secret` in `/etc/ecom/ecom-api.env`.
- Verify: `systemctl start ecom-api` then `systemctl is-active ecom-api`.

**Git authentication failure (pull fails on server)**
- Possible cause: deploy key missing/wrong permissions, or the `GIT_SSH_COMMAND` path is wrong.
- Check: `ls -la /root/.ssh/ecom_deploy_key*` (should be `600`), confirm the exact command from §7.
- Fix: re-check the key is still registered as a Deploy Key on the correct GitHub repo.
- Verify: re-run the `git pull` command manually.

**SSH failure (can't reach the server at all)**
- Possible cause: network/firewall issue, wrong key, server down. (This exact situation happened while
  writing this document — see §24.)
- Check: `ssh -i ~/.ssh/ecom_deploy -v root@187.77.150.88` for verbose connection diagnostics.
- Fix: depends on the cause — if it's a hosting-provider network issue, wait and retry; if the key
  changed, you'll need out-of-band console access to fix `authorized_keys`.
- Verify: `ssh -i ~/.ssh/ecom_deploy root@187.77.150.88 "echo OK"`.

**Dependency / build / migration failure during deploy**
- Check the exact error from the `dotnet publish` / `npx ng build` / `dotnet ef database update` command
  output — these are run directly over SSH in §13, so the error prints straight to your terminal.
- Do not blindly retry with `--force` or by skipping steps; fix the root cause (missing package, TS/type
  error, migration conflict) and redeploy from the top of §13.

**Database connection failure**
- Check: is the `ecom-sql` container running? `docker ps | grep ecom-sql`.
- Fix: `docker start ecom-sql` if stopped; if the container is gone entirely, it needs to be recreated
  (no compose file exists for this — see §2/§9 gap notes) with the same `MSSQL_SA_PASSWORD` the app
  expects in `/etc/ecom/ecom-api.env`.
- Verify: the sqlcmd query pattern in §9 succeeds.

**Missing environment variables**
- Symptom: app crashes on startup or a specific feature 500s.
- Check: `/etc/ecom/ecom-api.env` on the server against the table in §8.
- Fix: add the missing key, `systemctl restart ecom-api`.

**Permission problems**
- Symptom: app can't write to `/opt/ecom/uploads`, or files served with wrong ownership.
- Check: `ls -la /opt/ecom/uploads` — should be owned by `ecomapp` (the account `ecom-api` runs as).
- Fix: `chown -R ecomapp:ecomapp /opt/ecom/uploads`.

**SSL issues**
- Check: `certbot certificates` for expiry; browser cert warnings usually mean an expired/misconfigured
  cert.
- Fix: `certbot renew` (or the equivalent your setup uses — see §11's caveat that this wasn't
  re-confirmed this session).

**Port conflicts (local dev)**
- Symptom: `dotnet run` fails to bind, or the frontend can't reach the backend.
- Check: is Visual Studio's IIS Express already holding port 44303? (§3)
- Fix: stop the conflicting process, or don't run two backends on the same port at once.

---

## 18. Security Checklist

- [x] `.env`-equivalent secrets (`appsettings.Development.json`, `appsettings.*.json`) are gitignored in
      the backend repo; tracked `appsettings.json` holds only placeholder/blank values.
- [x] Frontend has no secret files — `environment.ts` files hold no credentials.
- [x] SSH private keys live only on the machines that need them, never in either repo.
- [x] Separate, repo-scoped deploy keys (not the admin SSH key) are used for `git pull` on the server.
- [x] Production traffic is HTTPS.
- [x] Firewall rules — verified 2026-09-07: `ufw` active, default deny incoming, allows only 22/tcp
      (OpenSSH), 80/tcp, 443/tcp (both v4 and v6).
- [x] Database is not publicly exposed (`127.0.0.1:1433` bind only).
- [x] OS security updates apply automatically (`unattended-upgrades`, security scope only — see §5).
- [ ] File permissions on `/opt/ecom/*` — spot-checked during deploys (`chown ecomapp:ecomapp` /
      `chown www-data:www-data`), not exhaustively audited.
- [ ] Secret rotation — no documented/scheduled process (see §8).
- [ ] Backup security — moot until backups exist at all (§15).
- ⚠️ **Deploy/admin SSH access uses the `root` user directly.** This works but is not least-privilege;
      consider a dedicated non-root deploy user with sudo for the specific commands needed, if hardening
      this further is ever a priority.
- ⚠️ `AutoMapper` 12.0.1 has an open NU1903 advisory (seen as a build warning throughout this project) —
      not remediated; worth a dependency bump when convenient.

---

## 19. Deployment Secrets Inventory (non-secret — no values)

| Secret/Credential | Purpose | Stored At | Used By | Rotation |
|---|---|---|---|---|
| Production DB `sa` password | Database auth | `ecom-sql` container env (`MSSQL_SA_PASSWORD`) + `/etc/ecom/ecom-api.env` | Backend, ad-hoc SQL diagnostics | Not scheduled — manual, see §8 |
| `Jwt:Secret` | Signs/validates access & refresh tokens | `/etc/ecom/ecom-api.env` (prod), `appsettings.Development.json` (local) | Backend | Not scheduled — manual, invalidates all sessions on change |
| Backend deploy key (`ecom_deploy_key`) | `git pull` for the backend repo on the server | `/root/.ssh/ecom_deploy_key` | Deploy process | Rotate via GitHub Deploy Keys settings if compromised |
| Frontend deploy key (`ecom_deploy_key_frontend`) | `git pull` for the frontend repo on the server | `/root/.ssh/ecom_deploy_key_frontend` | Deploy process | Same as above |
| Admin SSH key (`ecom_deploy`) | Full server access for deploys/maintenance | Local machine `~/.ssh/ecom_deploy`, public half in server `~/.ssh/authorized_keys` | Whoever deploys | Rotate by generating a new keypair and updating `authorized_keys` |
| SMTP credentials | Outbound email | `appsettings.Development.json` / prod env (currently blank — feature not active) | Backend | N/A while unused |

---

## 20. Quick Command Reference

```bash
# SSH
ssh -i ~/.ssh/ecom_deploy root@187.77.150.88

# Git (server-side pulls)
cd /opt/ecom/src/backend  && GIT_SSH_COMMAND='ssh -i /root/.ssh/ecom_deploy_key' git pull origin master
cd /opt/ecom/src/frontend && GIT_SSH_COMMAND='ssh -i /root/.ssh/ecom_deploy_key_frontend' git pull origin master

# Install / build
dotnet restore && dotnet build                        # backend, local
npm install                                             # frontend, local
dotnet publish -c Release -o /tmp/ecom-api-new           # backend, server
npx ng build --configuration production                  # frontend, server or local

# Start / stop / restart (backend only — frontend is static files)
systemctl start ecom-api
systemctl stop ecom-api
systemctl restart ecom-api

# Status / logs
systemctl status ecom-api
journalctl -u ecom-api -n 50 --no-pager
journalctl -u ecom-api -f
docker logs -f ecom-sql

# Database
dotnet ef database update                                # local
/root/run-ef.sh database update                          # production (run over SSH)
dotnet ef migrations add <Name>                           # local, after model changes

# Nginx
nginx -t && systemctl reload nginx

# SSL
certbot certificates

# Rollback (see §14 for full commands)
mv /opt/ecom/api /opt/ecom/api.broken && mv /opt/ecom/api.old /opt/ecom/api && systemctl restart ecom-api
mv /opt/ecom/web /opt/ecom/web.broken && mv /opt/ecom/web.old /opt/ecom/web
```

---

## 21. Change Management

1. Pull latest code (`git pull origin master`) in whichever repo you're changing.
2. Confirm branch: `git branch --show-current` (should be `master`).
3. Inspect the affected module before changing it — read the existing controller/service/component, don't
   guess at the pattern.
4. Make the change.
5. Test locally (`dotnet run` + `ng serve`, or targeted `dotnet test`/`ng test`).
6. Run the production build locally (`npx ng build --configuration production` and/or `dotnet build`) to
   catch anything that only breaks in the production config.
7. Review the diff (`git status`, `git diff`) — check nothing unintended (secrets, debug files) is staged.
8. Commit.
9. Push to `origin/master`.
10. Deploy (§13).
11. Verify production (curl the site, click through the actual changed feature — don't just trust a green
    build).
12. Check logs (§16) for anything unexpected post-deploy.
13. If anything about the *infrastructure itself* changed (server, domain, SSH, branch strategy, env vars,
    DB, Nginx, SSL, process manager, paths, hosting provider, backups) — update `PROJECT_KIT.md` in
    **both** repos (§23).

---

## 22. AI / Coding Agent Instructions

If you are an AI agent picking up work on this project:

- **Read this file (`PROJECT_KIT.md`) before doing any deployment-related work.** Don't ask the user for
  server IP, SSH details, or deploy steps that are already documented here.
- **Inspect the existing implementation before creating new architecture.** This project has consistent,
  established patterns (repository-per-aggregate, DTO-per-feature-folder, standalone Angular components,
  shared modal components parameterized rather than duplicated) — follow them.
- **Preserve existing workflows.** Don't redesign the deploy process, restructure repos, or change branch
  strategy without being explicitly asked to.
- **Reuse existing components/services** rather than writing near-duplicates — this codebase already does
  this consistently (e.g., one bank-details modal reused for both Bank Accounts and E Vault).
- **Never expose secrets** — not in code, not in commit messages, not in chat output, not in generated
  documentation. Use placeholders.
- **Never commit private keys, `.env` files, or `appsettings.Development.json`.**
- **Never print credentials in logs, terminal output, or responses** — when querying production data that
  requires a password (e.g., SQL diagnostics), reference the credential opaquely (environment variable
  expansion inside a remote shell) rather than ever displaying its value.
- **Never replace production configuration blindly** — read what's there first, change only what's needed.
- **Never run destructive database/server commands without explicit user confirmation** — this includes
  `DROP`, force-pushes, `rm -rf` outside scratch directories, and anything in §14's rollback commands.
- **Preserve the existing deployment architecture** (two independent repos, manual SSH-driven deploy,
  systemd + Nginx + Docker SQL Server) unless explicitly asked to change it.
- **Update `PROJECT_KIT.md` in both repos whenever deployment/infrastructure changes** (§23).
- **Always stop any test/dev backend process you start yourself** before ending a session, especially if
  bound to port 44303 (collides with the developer's own IIS Express — see §3).

---

## 23. Documentation Maintenance

Whenever any of the following changes, **update `PROJECT_KIT.md` in both `C:\ECom\ECom\` and
`C:\ECom\ecom-frontend\`** so they stay identical:

- Server (new host, new IP, provider change)
- Domain
- SSH (keys, users, port)
- Git repository (new remote, renamed repo, new default branch)
- Deployment branch or process
- Environment variables / secrets shape (not values — just which keys exist and what they're for)
- Database (engine, host, container name, migration approach)
- Nginx / reverse proxy config
- SSL setup
- Process manager (service name, manager itself)
- Application paths on the server
- Hosting provider
- CI/CD (if one is ever added — none exists today)
- Backup system (if one is ever added — none exists today)

This file must always represent the **current** production environment, not a historical snapshot. If you
find it's drifted from reality while doing other work, fix it as part of that work rather than leaving it
stale.

---

## 24. Documentation Session Notes (honesty log — not a permanent section to maintain)

This file was authored by an AI coding session that had, over its own prior work in this same session,
directly performed and verified: local dev setup, backend/frontend builds, EF Core migrations (both local
and production, via `/root/run-ef.sh`), and multiple full production deployments (both repos) using the
exact commands in §13 — all of which succeeded and were confirmed live against `myesellerstore.online`.

At the moment of *writing this specific file*, however, the production server (`187.77.150.88`) had
become **unreachable** (SSH connection timeout, and the site itself stopped responding to HTTPS requests
too) — a transient network/hosting issue, not something this documentation task caused. Because of this,
a few server-side specifics could not be freshly re-confirmed at write time and are marked as such above
(exact Nginx config file path/contents, exact systemd unit file contents, exact `/etc/ecom/ecom-api.env`
key names, SSL provider/renewal mechanism, firewall rules). Everything else in this document reflects
directly-verified facts from this session's actual deploys.

**Action item for the next person/agent with server access:** re-run the inspection commands referenced
in §5/§10/§11/§12 (nginx config, systemd unit file, certbot status) and remove this section once
confirmed, replacing the "not re-inspected" caveats with confirmed detail.

---

## 25. Final Repository Verification

- [x] File physically created at `C:\ECom\ECom\PROJECT_KIT.md` and `C:\ECom\ecom-frontend\PROJECT_KIT.md`.
- [x] Valid Markdown.
- [x] No duplicate/conflicting deployment docs exist elsewhere in either repo (only the generic
      Angular-CLI `README.md` in the frontend, which is not a deployment doc and is left untouched).
- [x] No secrets included — passwords, JWT secret value, SSH private key contents, and SA password value
      are all referenced by name/location only, never by value.
- [x] Reflects the actual project (module list, structure, commands) as inspected directly in this
      session — nothing invented.
- [x] Commands are based on actual configuration (`package.json` scripts, `launchSettings.json` ports,
      the exact deploy commands used repeatedly this session).
- [x] Deployment instructions are complete (backend + frontend, pre-flight through verification).
- [x] Rollback instructions present, including the database-migration caveat.
- [x] Server/Git/SSH information documented (real IP, real paths, real repo URLs) without exposing any
      private credential material.
