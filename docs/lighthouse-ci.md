# Lighthouse CI + Dashboard

This project uses Lighthouse CI to run repeatable audits for the web app and upload results to a self-hosted LHCI server dashboard.

## What is configured

- Root LHCI config: `.lighthouserc.cjs`
- GitHub Actions workflow: `.github/workflows/lighthouse-ci.yml`
- (optional) Local dashboard service: `lhci-server` in `docker-compose.yml` (profile: `observability`)
- Local helper scripts:
  - `pnpm lighthouse:dashboard:start`
  - `pnpm lighthouse:audit`
  - `pnpm lighthouse:dashboard:upload`

## Local commands

From repo root:

1) Run audits
```bash
pnpm lighthouse:audit
```

2) Start dashboard
```bash
pnpm lighthouse:dashboard:start
```

3) Upload to dashboard
```bash
pnpm lighthouse:dashboard:upload
```

Note for Apple Silicon (M-series Macs): this image currently runs as `linux/amd64` under emulation. This is expected and configured in Compose.

Open: `http://localhost:9001` for LHCI dashboard

## Local report output

- Raw LHCI artifacts: `.lighthouseci/`
- Human-readable reports: `reports/lighthouse/YYYYMMDD-HASH/`
- Per-commit index page: `reports/lighthouse/YYYYMMDD-HASH/index.html`

## (optional) Setting up the local LHCI dashboard

Use the interactive wizard:

```bash
pnpm lighthouse:dashboard:setup
```

Recommended wizard choices:

- ? Which wizard do you want to run? `new-project`
- ? What is the URL of your LHCI server? `http://admin:admin@localhost:9001`
- ? What would you like to name the project? `sunset-sunrise-predictor`
- ? Where is the project's code hosted? `https://github.com/nickskupien/sunset-sunrise-predictor`
- ? What branch is considered the repo's trunk or main branch? `main`

Save the generated `build token` and `admin token`.


## (optional) Environment setup

Create local env file:

```bash
cp .env.example .env
```

Set these values in `.env`:

```bash
LHCI_BASIC_AUTH_USERNAME=admin
LHCI_BASIC_AUTH_PASSWORD=admin
LHCI_SERVER_BASE_URL=http://localhost:9001
LHCI_TOKEN=<project-build-token>
LHCI_ADMIN_TOKEN=<project-admin-token>
```

`LHCI_TOKEN` is used for upload.
`LHCI_ADMIN_TOKEN` is used only when replacing an existing build for the same commit hash.

## Duplicate build behavior

LHCI does not allow two builds for the same commit hash by default.

`pnpm lighthouse:dashboard:upload` handles this by:
1. trying a normal upload
2. if duplicate hash exists, deleting existing build(s) for that hash (requires `LHCI_ADMIN_TOKEN`)
3. uploading replacement results

## GitHub Actions upload to LHCI server

Set these repository secrets:

- `LHCI_SERVER_BASE_URL` (example: `https://lhci.your-domain.com`)
- `LHCI_TOKEN` (project build token from `lighthouse:dashboard:setup`)

Workflow behavior:

- If both secrets exist, reports upload to your LHCI server dashboard.
- If either secret is missing, reports upload to temporary public storage.
- Raw artifacts are always uploaded as a GitHub Actions artifact (`lhci-artifacts`).
