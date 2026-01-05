const { BlobServiceClient } = require("@azure/storage-blob");

function getBlobServiceClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING");
  return BlobServiceClient.fromConnectionString(conn);
}

async function ensureContainer(containerName) {
  const service = getBlobServiceClient();
  const container = service.getContainerClient(containerName);
  await container.createIfNotExists();
  return container;
}

async function uploadBuffer(containerName, blobName, buffer, contentType) {
  const container = await ensureContainer(containerName);
  const blob = container.getBlockBlobClient(blobName);
  await blob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream" }
  });
  return blobName;
}

async function downloadStream(containerName, blobName) {
  const service = getBlobServiceClient();
  const container = service.getContainerClient(containerName);
  const blob = container.getBlobClient(blobName);
  const resp = await blob.download();
  return resp; // has readableStreamBody + contentType
}

async function readText(containerName, blobName) {
  const service = getBlobServiceClient();
  const container = service.getContainerClient(containerName);
  const blob = container.getBlobClient(blobName);

  const exists = await blob.exists();
  if (!exists) return { text: null, etag: null };

  const resp = await blob.download();
  const etag = resp.etag;
  const chunks = [];
  for await (const chunk of resp.readableStreamBody) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf-8");
  return { text, etag };
}

async function writeText(containerName, blobName, text, etag) {
  const container = await ensureContainer(containerName);
  const blob = container.getBlockBlobClient(blobName);

  const options = {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }
  };

  // Concurrency control using ETag (prevents overwriting concurrent edits)
  if (etag) {
    options.conditions = { ifMatch: etag };
  } else {
    options.conditions = { ifNoneMatch: "*" };
  }

  await blob.upload(text, Buffer.byteLength(text), options);
  return true;
}

module.exports = {
  ensureContainer,
  uploadBuffer,
  downloadStream,
  readText,
  writeText
};
