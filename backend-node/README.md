# Cloud Video App (Node.js backend + Azure Blob Storage)

This is a clean backend that replaces Flask with **Node.js (Express)** and stores:
- Videos in **Azure Blob Storage**
- Metadata (likes/views/comments) in a **metadata blob** (`data.json`)
- Optional sentiment analysis via **Azure AI Language** (Text Analytics)

## Quick deploy to Azure App Service (Linux)

### 1) Create Storage Containers
In your Storage Account:
- `videos`
- `metadata`

### 2) Create App Service
- Runtime stack: **Node 18 LTS** (or Node 20)
- OS: Linux

### 3) Deploy
Zip-deploy the **contents** of `backend-node` (package.json at ZIP root).

### 4) App Settings (Configuration)
Add these environment variables:
- `AZURE_STORAGE_CONNECTION_STRING` = Storage → Access keys → Connection string
- `VIDEO_CONTAINER` = `videos`
- `METADATA_CONTAINER` = `metadata`
- `METADATA_BLOB_NAME` = `data.json`

Optional sentiment:
- `TEXT_ANALYTICS_ENDPOINT`
- `TEXT_ANALYTICS_KEY`

Save + Restart.

### 5) Test
- `https://<app>.azurewebsites.net/health` -> OK
- `https://<app>.azurewebsites.net/api/videos` -> []

## Local run
Inside `backend-node`:
```bash
npm install
npm start
```

## Frontend
Set your backend base URL in your frontend JS, e.g.:
```js
const backend = "https://<your-app>.azurewebsites.net";
```
