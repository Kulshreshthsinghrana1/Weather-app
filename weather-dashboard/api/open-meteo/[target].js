const OPEN_METEO_TARGETS = {
  archive: "https://archive-api.open-meteo.com/v1/archive",
  "air-quality": "https://air-quality-api.open-meteo.com/v1/air-quality",
  geocoding: "https://geocoding-api.open-meteo.com/v1/search",
};

const MET_FORECAST_URL =
  "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const MET_USER_AGENT =
  "WeatherDashboard/1.0 https://github.com/Kulshreshthsinghrana1/Weather-app";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function buildQueryString(params) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined) query.append(key, item);
      });
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }

  return query.toString();
}

function formatDateTimeInZone(value, timeZone) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function getDateKey(value, timeZone) {
  return formatDateTimeInZone(value, timeZone).slice(0, 10);
}

function getBestPeriod(entry) {
  return (
    entry.data.next_1_hours ??
    entry.data.next_6_hours ??
    entry.data.next_12_hours ??
    null
  );
}

function getPrecipitationAmount(entry) {
  return getBestPeriod(entry)?.details?.precipitation_amount ?? 0;
}

function getPrecipitationProbability(entry) {
  return getBestPeriod(entry)?.details?.probability_of_precipitation ?? null;
}

function toKilometresPerHour(value) {
  return value === null || value === undefined ? null : value * 3.6;
}

function normalizeSymbolCode(symbolCode) {
  return (symbolCode ?? "").replace(/_(day|night|polartwilight)$/, "");
}

function mapSymbolCodeToWeatherCode(symbolCode) {
  const normalized = normalizeSymbolCode(symbolCode);

  if (normalized === "clearsky") return 0;
  if (normalized === "fair") return 1;
  if (normalized === "partlycloudy") return 2;
  if (normalized === "cloudy") return 3;
  if (normalized === "fog") return 45;
  if (normalized.includes("lightsnow")) return 71;
  if (normalized.includes("snow")) return 73;
  if (normalized.includes("heavysnow")) return 75;
  if (normalized.includes("sleet")) return 68;
  if (normalized.includes("lightrain")) return 61;
  if (normalized.includes("heavyrain")) return 65;
  if (normalized.includes("rain")) return 63;
  if (normalized.includes("thunder")) return 95;

  return 3;
}

function getWeatherCode(entry) {
  return mapSymbolCodeToWeatherCode(getBestPeriod(entry)?.summary?.symbol_code);
}

function pickCurrentEntry(entries, timeZone) {
  if (!entries.length) return null;

  const now = formatDateTimeInZone(new Date(), timeZone);
  let selected = entries[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  entries.forEach((entry) => {
    const entryTime = formatDateTimeInZone(entry.time, timeZone);
    const distance = Math.abs(new Date(entryTime).getTime() - new Date(now).getTime());

    if (distance < bestDistance) {
      bestDistance = distance;
      selected = entry;
    }
  });

  return selected;
}

function buildDailySummary(entries) {
  const temperatures = entries
    .map((entry) => entry.data.instant.details.air_temperature)
    .filter((value) => value !== null && value !== undefined);
  const windSpeeds = entries
    .map((entry) => toKilometresPerHour(entry.data.instant.details.wind_speed))
    .filter((value) => value !== null && value !== undefined);
  const uvIndexes = entries
    .map((entry) => entry.data.instant.details.ultraviolet_index_clear_sky)
    .filter((value) => value !== null && value !== undefined);
  const precipitationProbabilities = entries
    .map(getPrecipitationProbability)
    .filter((value) => value !== null && value !== undefined);

  const precipitationSum = entries.reduce(
    (sum, entry) => sum + getPrecipitationAmount(entry),
    0,
  );

  const middleEntry = entries[Math.floor(entries.length / 2)] ?? entries[0];

  return {
    weather_code: [getWeatherCode(middleEntry)],
    temperature_2m_max: [temperatures.length ? Math.max(...temperatures) : null],
    temperature_2m_min: [temperatures.length ? Math.min(...temperatures) : null],
    sunrise: [null],
    sunset: [null],
    uv_index_max: [uvIndexes.length ? Math.max(...uvIndexes) : null],
    precipitation_probability_max: [
      precipitationProbabilities.length
        ? Math.max(...precipitationProbabilities)
        : null,
    ],
    precipitation_sum: [precipitationSum],
    wind_speed_10m_max: [windSpeeds.length ? Math.max(...windSpeeds) : null],
  };
}

function buildForecastPayload(metData, query) {
  const timeZone =
    typeof query.timezone === "string" && query.timezone && query.timezone !== "auto"
      ? query.timezone
      : "UTC";
  const targetDate = query.start_date;

  const dayEntries = (metData.properties?.timeseries ?? []).filter(
    (entry) => getDateKey(entry.time, timeZone) === targetDate,
  );

  if (!dayEntries.length) {
    return {
      error: true,
      status: 404,
      body: { error: "No forecast data available for the selected date." },
    };
  }

  const currentEntry = pickCurrentEntry(dayEntries, timeZone);

  return {
    error: false,
    body: {
      latitude: metData.geometry?.coordinates?.[1] ?? Number(query.latitude),
      longitude: metData.geometry?.coordinates?.[0] ?? Number(query.longitude),
      timezone: timeZone,
      current: currentEntry
        ? {
            temperature_2m: currentEntry.data.instant.details.air_temperature ?? null,
            relative_humidity_2m:
              currentEntry.data.instant.details.relative_humidity ?? null,
            wind_speed_10m: toKilometresPerHour(
              currentEntry.data.instant.details.wind_speed,
            ),
            wind_direction_10m:
              currentEntry.data.instant.details.wind_from_direction ?? null,
            precipitation: getPrecipitationAmount(currentEntry),
            visibility: null,
            weather_code: getWeatherCode(currentEntry),
          }
        : null,
      hourly: {
        time: dayEntries.map((entry) => formatDateTimeInZone(entry.time, timeZone)),
        temperature_2m: dayEntries.map(
          (entry) => entry.data.instant.details.air_temperature ?? null,
        ),
        relative_humidity_2m: dayEntries.map(
          (entry) => entry.data.instant.details.relative_humidity ?? null,
        ),
        precipitation: dayEntries.map(getPrecipitationAmount),
        precipitation_probability: dayEntries.map(getPrecipitationProbability),
        visibility: dayEntries.map(() => null),
        wind_speed_10m: dayEntries.map((entry) =>
          toKilometresPerHour(entry.data.instant.details.wind_speed),
        ),
        wind_direction_10m: dayEntries.map(
          (entry) => entry.data.instant.details.wind_from_direction ?? null,
        ),
        weather_code: dayEntries.map(getWeatherCode),
      },
      daily: {
        time: [targetDate],
        ...buildDailySummary(dayEntries),
      },
    },
  };
}

async function handleForecastRequest(query, res) {
  const upstreamUrl = `${MET_FORECAST_URL}?lat=${query.latitude}&lon=${query.longitude}`;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": MET_USER_AGENT,
      },
    });
  } catch (proxyError) {
    console.error("forecast proxy failed", {
      upstreamUrl,
      error: proxyError.message,
    });
    res.status(502).json({ error: "Unable to reach the forecast provider." });
    return;
  }

  const responseText = await upstreamResponse.text();
  if (!upstreamResponse.ok) {
    res
      .status(upstreamResponse.status)
      .send(responseText || "Forecast provider returned an error.");
    return;
  }

  const transformed = buildForecastPayload(JSON.parse(responseText), query);
  if (transformed.error) {
    res.status(transformed.status).json(transformed.body);
    return;
  }

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.setHeader("Content-Type", JSON_CONTENT_TYPE);
  res.status(200).json(transformed.body);
}

async function handleOpenMeteoRequest(target, query, res) {
  const baseUrl = OPEN_METEO_TARGETS[target];
  if (!baseUrl) {
    res.status(404).json({ error: `Unknown Open-Meteo target: ${target}` });
    return;
  }

  const queryString = buildQueryString(query);
  const upstreamUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: {
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

  if (target === "forecast") {
    await handleForecastRequest(query, res);
    return;
  }

  await handleOpenMeteoRequest(target, query, res);
}
