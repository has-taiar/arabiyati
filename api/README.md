# Arabiyati API · Cloud sync for Arabiyati

Azure Functions (Python v2) backend that lets parents back up child profiles
across devices. The frontend on GitHub Pages keeps working **fully offline**
even when this API is unreachable — sync is best-effort.

## What's here

- `function_app.py` — all endpoints
- `requirements.txt` — Python deps
- `host.json` — Functions runtime config
- `local.settings.json.example` — copy to `local.settings.json` for local dev

## Endpoints

| Method | Path                  | Auth   | Purpose                           |
|--------|-----------------------|--------|-----------------------------------|
| POST   | `/api/auth/magiclink` | none   | Email a one-time sign-in link     |
| GET    | `/api/auth/verify`    | none   | Exchange one-time token for JWT   |
| GET    | `/api/profiles`       | bearer | List parent's child profiles      |
| POST   | `/api/profiles`       | bearer | Create a child profile            |
| GET    | `/api/profiles/{id}`  | bearer | Load full profile state JSON      |
| PUT    | `/api/profiles/{id}`  | bearer | Save full profile state JSON      |
| DELETE | `/api/profiles/{id}`  | bearer | Delete a child profile            |
| GET    | `/api/health`         | none   | Liveness probe                    |

## Tokens

- **Magic-link token**: 5 min TTL, single-use, stored in `magiclinks` table
- **JWT** (HS256): 24 h TTL, signed with `JWT_SECRET`, stored client-side

## Storage tables (auto-created)

| Table       | PartitionKey | RowKey      | Fields                                |
|-------------|--------------|-------------|---------------------------------------|
| parents     | email_lower  | `'parent'`  | parent_id                             |
| profiles    | parent_id    | profile_id  | name, avatar, data_json, updated      |
| magiclinks  | email_lower  | token       | expires, used                         |

## Required app settings

Set on the Function App (Configuration → Application settings):

| Name                       | Description                                                |
|----------------------------|------------------------------------------------------------|
| `TABLES_CONNECTION_STRING` | Connection string for the storage account                  |
| `ACS_CONNECTION_STRING`    | Azure Communication Services resource connection string    |
| `ACS_SENDER_ADDRESS`       | Verified sender e.g. `DoNotReply@yourdomain.com`           |
| `JWT_SECRET`               | Long random string (`openssl rand -hex 32`)                |
| `MAGIC_LINK_BASE`          | `https://has-taiar.github.io/arabiyati/#/auth`             |
| `ALLOWED_ORIGIN`           | `https://has-taiar.github.io` (or `https://huroof.au`)     |

## One-time Azure setup

```bash
RG=arabiyati-rg
LOC=australiaeast
SA=arabiyatistore$RANDOM         # must be globally unique
FA=arabiyati-api-$RANDOM         # must be globally unique
ACS=arabiyati-comms

az group create -n $RG -l $LOC

az storage account create -n $SA -g $RG -l $LOC --sku Standard_LRS

az functionapp create \
  -g $RG -n $FA \
  --storage-account $SA \
  --consumption-plan-location $LOC \
  --runtime python --runtime-version 3.11 \
  --functions-version 4 --os-type Linux

# Communication Services + email domain (or use Azure managed domain)
az communication create -g $RG -n $ACS --location global --data-location australia
# Then add an email communication service + domain via portal (managed domain works for testing)

# App settings
TCS=$(az storage account show-connection-string -n $SA -g $RG --query connectionString -o tsv)
JWT=$(openssl rand -hex 32)

az functionapp config appsettings set -g $RG -n $FA --settings \
  TABLES_CONNECTION_STRING="$TCS" \
  JWT_SECRET="$JWT" \
  MAGIC_LINK_BASE="https://has-taiar.github.io/arabiyati/#/auth" \
  ALLOWED_ORIGIN="https://has-taiar.github.io"
# After ACS + domain provisioned, also set ACS_CONNECTION_STRING and ACS_SENDER_ADDRESS

# CORS (in addition to ALLOWED_ORIGIN env var)
az functionapp cors add -g $RG -n $FA --allowed-origins https://has-taiar.github.io https://huroof.au

# Get publish profile (paste content into GitHub secret)
az functionapp deployment list-publishing-profiles -g $RG -n $FA --xml
```

## GitHub configuration

Add to the repo:

- **Secret** `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` — the XML from the command above
- **Secret** `AZURE_FUNCTIONAPP_NAME` — your function app name (or convert to a variable)

The workflow at `.github/workflows/deploy-api.yml` deploys on every push that
touches `api/**`.

## Wire the frontend to the API

Edit `index.html` and set:

```html
<script>window.ARABIYATI_API_BASE = 'https://YOUR-FUNC.azurewebsites.net/api';</script>
```

Leave it `''` (empty) to disable cloud sync entirely (offline-only mode).

## Local development

```bash
cd api
cp local.settings.json.example local.settings.json
# Fill in the values, then:
func start
```

Requires the Azure Functions Core Tools v4 and Python 3.11.
