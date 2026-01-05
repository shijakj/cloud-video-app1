const { TextAnalyticsClient, AzureKeyCredential } = require("@azure/ai-text-analytics");

function getClient() {
  const endpoint = process.env.TEXT_ANALYTICS_ENDPOINT || "";
  const key = process.env.TEXT_ANALYTICS_KEY || "";
  if (!endpoint || !key) return null;
  return new TextAnalyticsClient(endpoint, new AzureKeyCredential(key));
}

async function analyzeSentiment(text) {
  const client = getClient();
  if (!client) return "neutral";

  try {
    const result = await client.analyzeSentiment([text]);
    return result?.[0]?.sentiment || "neutral";
  } catch {
    return "neutral";
  }
}

module.exports = { analyzeSentiment };
