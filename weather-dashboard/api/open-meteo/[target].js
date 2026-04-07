const ALLOWED_TARGETS = {
  forecast: "https://api.open-meteo.com/v1/forecast",
  archive: "https://archive-api.open-meteo.com/v1/archive",
  "air-quality": "https://air-quality-api.open-meteo.com/v1/air-quality",
  geocoding: "https://geocoding-api.open-meteo.com/v1/search",
};

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function buildQueryString(query) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }

  return params.toString();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { target, ...query } = req.query;

  if (!target) {
    res.status(400).json({ error: "Missing Open-Meteo target" });
    return;
  }

  const baseUrl = ALLOWED_TARGETS[target];
  if (!baseUrl) {
    res.status(404).json({ error: `Unknown Open-Meteo target: ${target}` });
    return;
  }

  const queryString = buildQueryString(query);
  const upstreamUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;

  const upstreamUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;

  console.log("proxy request", { target, upstreamUrl });

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "weather-dashboard-vercel-proxy",
        Accept: "application/json",
      },
    });
  } catch (proxyError) {
    console.error("proxy failed", {
      target,
      upstreamUrl,
      error: {
        message: proxyError.message,
        stack: proxyError.stack,
        code: proxyError.code,
      },
    });
    res
      .status(502)
      .json({ error: "Unable to reach Open-Meteo. Try again later." });
    return;
  }

  const responseText = await upstreamResponse.text();
  const contentType =
    upstreamResponse.headers.get("content-type") ?? JSON_CONTENT_TYPE;

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.setHeader("Content-Type", contentType);
  res.status(upstreamResponse.status).send(responseText);
}
