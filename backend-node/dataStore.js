const { readText, writeText, ensureContainer } = require("./blobStorage");

const METADATA_CONTAINER = process.env.METADATA_CONTAINER || "metadata";
const METADATA_BLOB_NAME = process.env.METADATA_BLOB_NAME || "data.json";

async function initStore() {
  await ensureContainer(METADATA_CONTAINER);

  // create empty data.json if missing
  const { text } = await readText(METADATA_CONTAINER, METADATA_BLOB_NAME);
  if (!text) {
    const empty = JSON.stringify({ videos: [] }, null, 2);
    await writeText(METADATA_CONTAINER, METADATA_BLOB_NAME, empty, null).catch(() => {});
  }
}

async function loadData() {
  const { text, etag } = await readText(METADATA_CONTAINER, METADATA_BLOB_NAME);
  if (!text) return { data: { videos: [] }, etag: null };
  try {
    return { data: JSON.parse(text), etag };
  } catch {
    return { data: { videos: [] }, etag };
  }
}

// retry a few times in case of ETag conflict
async function saveData(updateFn) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, etag } = await loadData();
    const newData = updateFn(data);
    const body = JSON.stringify(newData, null, 2);

    try {
      // If file exists, use ifMatch; if not, first attempt may create it
      if (etag) {
        await writeText(METADATA_CONTAINER, METADATA_BLOB_NAME, body, etag);
      } else {
        await writeText(METADATA_CONTAINER, METADATA_BLOB_NAME, body, null);
      }
      return newData;
    } catch (e) {
      // ETag conflict => someone else wrote first; retry
      if (attempt === 5) throw e;
    }
  }
}

module.exports = { initStore, loadData, saveData };
