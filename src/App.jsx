import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";

const PAGE_CURRENT = "current";
const PAGE_HISTORY = "history";
const TODAY = toISODate(new Date());
const SINGLE_DAY_MIN = shiftYears(TODAY, -2);
const SINGLE_DAY_MAX = shiftDays(TODAY, 7);
const DEFAULT_RANGE_START = shiftDays(TODAY, -30);

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function shiftYears(dateString, years) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setFullYear(date.getFullYear() + years);
  return toISODate(date);
}

function getDayDifference(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function formatDateLabel(value) {
  if (!value) return "--";
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value, suffix = "", maximumFractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }

  return `${new Intl.NumberFormat([], {
    maximumFractionDigits,
  }).format(value)}${suffix}`;
}

function weatherMeta(code) {
  if (code === 0) return { icon: "\u2600\uFE0F", label: "Clear sky" };
  if (code <= 3) return { icon: "\u26C5", label: "Partly cloudy" };
  if (code <= 48) return { icon: "\uD83C\uDF2B\uFE0F", label: "Foggy" };
  if (code <= 67) return { icon: "\uD83C\uDF27\uFE0F", label: "Rainy" };
  if (code <= 77) return { icon: "\u2744\uFE0F", label: "Snow" };
  return { icon: "\u26C8\uFE0F", label: "Stormy" };
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

function buildSearchLabel(result) {
  return [result.name, result.admin1, result.country]
    .filter(Boolean)
    .join(", ");
}

function ChartPanel({ title, caption, children }) {
  return (
    <section className="chart-panel">
      <div className="section-heading">
        <h3>{title}</h3>
        {caption ? <p>{caption}</p> : null}
      </div>
      <div className="chart-shell">{children}</div>
    </section>
  );
}

function WeatherLineChart({ data, lines, area = false }) {
  if (!data.length) {
    return (
      <div className="empty-chart">No data available for this chart yet.</div>
    );
  }

  const ChartComponent = area ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ChartComponent data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
        <XAxis dataKey="label" tickMargin={10} minTickGap={24} />
        <YAxis tickMargin={10} />
        <Tooltip />
        <Legend />
        {area
          ? lines.map((line) => (
              <Area
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.name}
                stroke={line.stroke}
                fill={line.fill ?? line.stroke}
                fillOpacity={0.18}
              />
            ))
          : lines.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.name}
                stroke={line.stroke}
                strokeWidth={2.4}
                dot={false}
              />
            ))}
      </ChartComponent>
    </ResponsiveContainer>
  );
}

function App() {
  const [page, setPage] = useState(PAGE_CURRENT);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  const [locationLabel, setLocationLabel] = useState("Current location");
  const [searchInput, setSearchInput] = useState("");
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [startDate, setStartDate] = useState(DEFAULT_RANGE_START);
  const [endDate, setEndDate] = useState(TODAY);
  const [weatherData, setWeatherData] = useState(null);
  const [airData, setAirData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setWeatherLoading(false);
      setError("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLon(position.coords.longitude);
        setLocationLabel("Current location");
      },
      () => {
        setWeatherLoading(false);
        setError("Location access denied. Search for a city to continue.");
      },
    );
  }, []);

  useEffect(() => {
    if (lat === null || lon === null || !selectedDate) {
      return;
    }

    const weatherController = new AbortController();
    const airController = new AbortController();
    const isPastDay = selectedDate < TODAY;

    async function loadSelectedDate() {
      try {
        setWeatherLoading(true);
        setError(null);

        const weatherParams = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          start_date: selectedDate,
          end_date: selectedDate,
          hourly:
            "temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,visibility,wind_speed_10m,wind_direction_10m,weather_code",
          daily:
            "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
          timezone: "auto",
        });

        if (!isPastDay && selectedDate === TODAY) {
          weatherParams.set(
            "current",
            "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,visibility,weather_code",
          );
        }

        const weatherBase = isPastDay
          ? "https://archive-api.open-meteo.com/v1/archive"
          : "https://api.open-meteo.com/v1/forecast";

        const airParams = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          start_date: selectedDate,
          end_date: selectedDate,
          hourly: "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide",
          timezone: "auto",
        });

        if (selectedDate === TODAY) {
          airParams.set(
            "current",
            "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide",
          );
        }

        const [weatherResponse, airResponse] = await Promise.all([
          fetchJson(
            `${weatherBase}?${weatherParams.toString()}`,
            weatherController.signal,
          ),
          fetchJson(
            `https://air-quality-api.open-meteo.com/v1/air-quality?${airParams.toString()}`,
            airController.signal,
          ),
        ]);

        setWeatherData(weatherResponse);
        setAirData(airResponse);
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setError("Unable to load the selected weather data right now.");
        }
      } finally {
        setWeatherLoading(false);
      }
    }

    loadSelectedDate();

    return () => {
      weatherController.abort();
      airController.abort();
    };
  }, [lat, lon, selectedDate]);

  useEffect(() => {
    if (lat === null || lon === null || !startDate || !endDate) {
      return;
    }

    if (endDate < startDate) {
      setHistoryError("End date must be on or after the start date.");
      setHistoryData(null);
      return;
    }

    if (getDayDifference(startDate, endDate) > 730) {
      setHistoryError("Please keep the historical range within 2 years.");
      setHistoryData(null);
      return;
    }

    const controller = new AbortController();

    async function loadHistory() {
      try {
        setHistoryLoading(true);
        setHistoryError(null);

        const params = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          start_date: startDate,
          end_date: endDate,
          daily:
            "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
          timezone: "auto",
        });

        const response = await fetchJson(
          `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`,
          controller.signal,
        );

        setHistoryData(response);
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setHistoryError(
            "Unable to load the historical range for this location.",
          );
        }
      } finally {
        setHistoryLoading(false);
      }
    }

    loadHistory();

    return () => controller.abort();
  }, [lat, lon, startDate, endDate]);

  async function handleSearch(event) {
    event.preventDefault();
    const city = searchInput.trim();

    if (!city) {
      return;
    }

    try {
      setSearching(true);
      setError(null);

      const params = new URLSearchParams({
        name: city,
        count: "1",
        language: "en",
      });
      const data = await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
      );

      if (!data.results?.length) {
        setError("No matching city found. Try a broader search.");
        return;
      }

      const [result] = data.results;
      setLat(result.latitude);
      setLon(result.longitude);
      setLocationLabel(buildSearchLabel(result));
    } catch {
      setError("City lookup failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  const selectedSnapshot = useMemo(() => {
    if (!weatherData) return null;

    if (selectedDate === TODAY && weatherData.current) {
      return weatherData.current;
    }

    const hourlyTimes = weatherData.hourly?.time ?? [];
    if (!hourlyTimes.length) return null;

    const preferredHour = selectedDate === TODAY ? new Date().getHours() : 12;

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    hourlyTimes.forEach((time, index) => {
      const hour = new Date(time).getHours();
      const distance = Math.abs(hour - preferredHour);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return {
      temperature_2m: weatherData.hourly?.temperature_2m?.[bestIndex],
      relative_humidity_2m:
        weatherData.hourly?.relative_humidity_2m?.[bestIndex],
      wind_speed_10m: weatherData.hourly?.wind_speed_10m?.[bestIndex],
      wind_direction_10m: weatherData.hourly?.wind_direction_10m?.[bestIndex],
      precipitation: weatherData.hourly?.precipitation?.[bestIndex],
      visibility: weatherData.hourly?.visibility?.[bestIndex],
      weather_code:
        weatherData.hourly?.weather_code?.[bestIndex] ??
        weatherData.daily?.weather_code?.[0],
    };
  }, [selectedDate, weatherData]);

  const selectedAirSnapshot = useMemo(() => {
    if (!airData) return null;

    if (selectedDate === TODAY && airData.current) {
      return airData.current;
    }

    const hourlyTimes = airData.hourly?.time ?? [];
    if (!hourlyTimes.length) return null;

    const preferredHour = selectedDate === TODAY ? new Date().getHours() : 12;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    hourlyTimes.forEach((time, index) => {
      const hour = new Date(time).getHours();
      const distance = Math.abs(hour - preferredHour);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return {
      pm10: airData.hourly?.pm10?.[bestIndex],
      pm2_5: airData.hourly?.pm2_5?.[bestIndex],
      carbon_monoxide: airData.hourly?.carbon_monoxide?.[bestIndex],
      nitrogen_dioxide: airData.hourly?.nitrogen_dioxide?.[bestIndex],
      sulphur_dioxide: airData.hourly?.sulphur_dioxide?.[bestIndex],
    };
  }, [airData, selectedDate]);

  const weatherSummary = useMemo(() => {
    if (!weatherData?.daily) return null;
    return {
      maxTemp: weatherData.daily.temperature_2m_max?.[0],
      minTemp: weatherData.daily.temperature_2m_min?.[0],
      sunrise: weatherData.daily.sunrise?.[0],
      sunset: weatherData.daily.sunset?.[0],
      uvIndex: weatherData.daily.uv_index_max?.[0],
      rainProbability: weatherData.daily.precipitation_probability_max?.[0],
      precipitationSum: weatherData.daily.precipitation_sum?.[0],
      windMax: weatherData.daily.wind_speed_10m_max?.[0],
      weatherCode: weatherData.daily.weather_code?.[0],
    };
  }, [weatherData]);

  const weatherChartData = useMemo(
    () =>
      (weatherData?.hourly?.time ?? []).map((time, index) => ({
        label: formatTimeLabel(time),
        temperature: weatherData.hourly.temperature_2m?.[index],
        humidity: weatherData.hourly.relative_humidity_2m?.[index],
        precipitation: weatherData.hourly.precipitation?.[index],
        precipitationProbability:
          weatherData.hourly.precipitation_probability?.[index],
        visibility: weatherData.hourly.visibility?.[index],
        windSpeed: weatherData.hourly.wind_speed_10m?.[index],
        windDirection: weatherData.hourly.wind_direction_10m?.[index],
      })),
    [weatherData],
  );

  const airChartData = useMemo(
    () =>
      (airData?.hourly?.time ?? []).map((time, index) => ({
        label: formatTimeLabel(time),
        pm10: airData.hourly.pm10?.[index],
        pm25: airData.hourly.pm2_5?.[index],
        co: airData.hourly.carbon_monoxide?.[index],
        no2: airData.hourly.nitrogen_dioxide?.[index],
        so2: airData.hourly.sulphur_dioxide?.[index],
      })),
    [airData],
  );

  const historyChartData = useMemo(
    () =>
      (historyData?.daily?.time ?? []).map((date, index) => ({
        label: new Date(`${date}T00:00:00`).toLocaleDateString([], {
          month: "short",
          day: "numeric",
        }),
        maxTemp: historyData.daily.temperature_2m_max?.[index],
        minTemp: historyData.daily.temperature_2m_min?.[index],
        rain: historyData.daily.precipitation_sum?.[index],
        wind: historyData.daily.wind_speed_10m_max?.[index],
      })),
    [historyData],
  );

  const historySummary = useMemo(() => {
    if (!historyChartData.length) return null;

    const averageMaxTemp =
      historyChartData.reduce((sum, day) => sum + (day.maxTemp ?? 0), 0) /
      historyChartData.length;
    const totalRain = historyChartData.reduce(
      (sum, day) => sum + (day.rain ?? 0),
      0,
    );
    const peakWind = historyChartData.reduce(
      (max, day) => Math.max(max, day.wind ?? 0),
      0,
    );

    return {
      days: historyChartData.length,
      averageMaxTemp,
      totalRain,
      peakWind,
    };
  }, [historyChartData]);

  const selectedWeatherMeta = weatherMeta(
    selectedSnapshot?.weather_code ?? weatherSummary?.weatherCode,
  );

  function handleDownload() {
    const payload = {
      location: {
        label: locationLabel,
        latitude: lat,
        longitude: lon,
      },
      selectedDate,
      weatherData,
      airData,
      history: {
        startDate,
        endDate,
        historyData,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "weather-dashboard-data.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`app-shell ${dark ? "theme-dark" : "theme-light"}`}>
      <div className="aurora aurora-left" />
      <div className="aurora aurora-right" />

      <main className="app">
        <header className="hero-card">
          <div>
            <h1>Weather Dashboard</h1>
            <p className="hero-copy">
              Explore a single day in detail, then switch to the 2-year history
              page to compare long-term temperature, rain, and wind patterns.
            </p>
          </div>

          <div className="hero-actions">
            <div
              className="tab-group"
              role="tablist"
              aria-label="Dashboard pages"
            >
              <button
                type="button"
                className={page === PAGE_CURRENT ? "active" : ""}
                onClick={() => setPage(PAGE_CURRENT)}
              >
                Page 1
              </button>
              <button
                type="button"
                className={page === PAGE_HISTORY ? "active" : ""}
                onClick={() => setPage(PAGE_HISTORY)}
              >
                Page 2
              </button>
            </div>

            <button
              type="button"
              className="ghost-button"
              onClick={() => setDark((value) => !value)}
            >
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </header>

        <section className="toolbar">
          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search a city, e.g. Delhi"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit" disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>

          <div className="meta-strip">
            <span className="pill">{locationLabel}</span>
            {lat !== null && lon !== null ? (
              <span className="pill">
                {lat.toFixed(2)}, {lon.toFixed(2)}
              </span>
            ) : null}
            <button
              type="button"
              className="ghost-button"
              onClick={handleDownload}
            >
              Download JSON
            </button>
          </div>
        </section>

        {error ? <div className="status-banner error">{error}</div> : null}

        {page === PAGE_CURRENT ? (
          <>
            <section className="section-card">
              <div className="section-heading">
                <h2>Page 1: Current Weather & Hourly Forecast</h2>
                <p>
                  Pick a single date between {formatDateLabel(SINGLE_DAY_MIN)}{" "}
                  and {formatDateLabel(SINGLE_DAY_MAX)}.
                </p>
              </div>

              <div className="control-row">
                <label className="field">
                  <span>Single Date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    min={SINGLE_DAY_MIN}
                    max={SINGLE_DAY_MAX}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </label>
              </div>
            </section>

            {weatherLoading ? (
              <div className="status-banner">
                Loading selected-day weather data...
              </div>
            ) : (
              <>
                <section className="overview-grid">
                  <article className="spotlight-card">
                    <div className="spotlight-icon">
                      {selectedWeatherMeta.icon}
                    </div>
                    <div>
                      <p className="eyebrow">
                        {selectedDate === TODAY
                          ? "Current snapshot"
                          : "Selected-day snapshot"}
                      </p>
                      <h2>{formatDateLabel(selectedDate)}</h2>
                      <p className="spotlight-copy">
                        {selectedWeatherMeta.label}
                      </p>
                    </div>
                    <div className="spotlight-temp">
                      {formatNumber(
                        selectedSnapshot?.temperature_2m,
                        "\u00B0C",
                      )}
                    </div>
                  </article>

                  <article className="metric-card">
                    <span>Humidity</span>
                    <strong>
                      {formatNumber(
                        selectedSnapshot?.relative_humidity_2m,
                        "%",
                      )}
                    </strong>
                    <p>Relative humidity at the selected hour.</p>
                  </article>

                  <article className="metric-card">
                    <span>Wind Speed</span>
                    <strong>
                      {formatNumber(selectedSnapshot?.wind_speed_10m, " km/h")}
                    </strong>
                    <p>Surface wind at 10 metres.</p>
                  </article>

                  <article className="metric-card">
                    <span>Visibility</span>
                    <strong>
                      {formatNumber(selectedSnapshot?.visibility, " m", 0)}
                    </strong>
                    <p>How far conditions remain visible.</p>
                  </article>

                  <article className="metric-card">
                    <span>UV Index</span>
                    <strong>
                      {formatNumber(weatherSummary?.uvIndex, "", 0)}
                    </strong>
                    <p>Maximum UV expected for the day.</p>
                  </article>

                  <article className="metric-card">
                    <span>Rain Probability</span>
                    <strong>
                      {formatNumber(weatherSummary?.rainProbability, "%", 0)}
                    </strong>
                    <p>Highest rain probability across the day.</p>
                  </article>

                  <article className="metric-card">
                    <span>PM2.5</span>
                    <strong>
                      {formatNumber(
                        selectedAirSnapshot?.pm2_5,
                        " \u00B5g/m\u00B3",
                      )}
                    </strong>
                    <p>Fine particulate matter concentration.</p>
                  </article>

                  <article className="metric-card">
                    <span>PM10</span>
                    <strong>
                      {formatNumber(
                        selectedAirSnapshot?.pm10,
                        " \u00B5g/m\u00B3",
                      )}
                    </strong>
                    <p>Coarse particulate matter concentration.</p>
                  </article>
                </section>

                <section className="section-card">
                  <div className="section-heading">
                    <h2>Daily Details</h2>
                    <p>These values summarize the selected day.</p>
                  </div>

                  <div className="facts-grid">
                    <div className="fact">
                      <span>Max temperature</span>
                      <strong>
                        {formatNumber(weatherSummary?.maxTemp, "\u00B0C")}
                      </strong>
                    </div>
                    <div className="fact">
                      <span>Min temperature</span>
                      <strong>
                        {formatNumber(weatherSummary?.minTemp, "\u00B0C")}
                      </strong>
                    </div>
                    <div className="fact">
                      <span>Rain total</span>
                      <strong>
                        {formatNumber(weatherSummary?.precipitationSum, " mm")}
                      </strong>
                    </div>
                    <div className="fact">
                      <span>Peak wind</span>
                      <strong>
                        {formatNumber(weatherSummary?.windMax, " km/h")}
                      </strong>
                    </div>
                    <div className="fact">
                      <span>Sunrise</span>
                      <strong>
                        {formatTimeLabel(weatherSummary?.sunrise)}
                      </strong>
                    </div>
                    <div className="fact">
                      <span>Sunset</span>
                      <strong>{formatTimeLabel(weatherSummary?.sunset)}</strong>
                    </div>
                  </div>
                </section>

                <section className="charts-grid">
                  <ChartPanel
                    title="Temperature"
                    caption="Hourly temperature across the selected date."
                  >
                    <WeatherLineChart
                      data={weatherChartData}
                      lines={[
                        {
                          dataKey: "temperature",
                          name: "Temperature",
                          stroke: "#ff7b72",
                          fill: "#ff7b72",
                        },
                      ]}
                      area
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="Humidity"
                    caption="Relative humidity at hourly intervals."
                  >
                    <WeatherLineChart
                      data={weatherChartData}
                      lines={[
                        {
                          dataKey: "humidity",
                          name: "Humidity",
                          stroke: "#4cc9f0",
                        },
                      ]}
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="Precipitation"
                    caption="Rainfall amount and probability together."
                  >
                    <WeatherLineChart
                      data={weatherChartData}
                      lines={[
                        {
                          dataKey: "precipitation",
                          name: "Rain (mm)",
                          stroke: "#60a5fa",
                        },
                        {
                          dataKey: "precipitationProbability",
                          name: "Probability (%)",
                          stroke: "#f59e0b",
                        },
                      ]}
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="Visibility"
                    caption="Visibility trend throughout the day."
                  >
                    <WeatherLineChart
                      data={weatherChartData}
                      lines={[
                        {
                          dataKey: "visibility",
                          name: "Visibility",
                          stroke: "#14b8a6",
                        },
                      ]}
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="Wind Speed"
                    caption="Wind speed measured at 10 metres."
                  >
                    <WeatherLineChart
                      data={weatherChartData}
                      lines={[
                        {
                          dataKey: "windSpeed",
                          name: "Wind Speed",
                          stroke: "#8b5cf6",
                        },
                      ]}
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="Wind Direction"
                    caption="Hourly wind direction in degrees."
                  >
                    <WeatherLineChart
                      data={weatherChartData}
                      lines={[
                        {
                          dataKey: "windDirection",
                          name: "Wind Direction",
                          stroke: "#f97316",
                        },
                      ]}
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="PM10 vs PM2.5"
                    caption="Hourly particulate matter trend."
                  >
                    <WeatherLineChart
                      data={airChartData}
                      lines={[
                        { dataKey: "pm10", name: "PM10", stroke: "#ef4444" },
                        { dataKey: "pm25", name: "PM2.5", stroke: "#2563eb" },
                      ]}
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="CO / NO2 / SO2"
                    caption="Hourly gas concentration trend."
                  >
                    <WeatherLineChart
                      data={airChartData}
                      lines={[
                        { dataKey: "co", name: "CO", stroke: "#22c55e" },
                        { dataKey: "no2", name: "NO2", stroke: "#e11d48" },
                        { dataKey: "so2", name: "SO2", stroke: "#7c3aed" },
                      ]}
                    />
                  </ChartPanel>
                </section>
              </>
            )}
          </>
        ) : (
          <>
            <section className="section-card">
              <div className="section-heading">
                <h2>Page 2: Historical Date Range</h2>
                <p>Choose a historical range up to 2 years long.</p>
              </div>

              <div className="control-row range-row">
                <label className="field">
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={startDate}
                    min={SINGLE_DAY_MIN}
                    max={TODAY}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>End Date</span>
                  <input
                    type="date"
                    value={endDate}
                    min={SINGLE_DAY_MIN}
                    max={TODAY}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </label>
              </div>

              <p className="helper-copy">
                Range selected: {formatDateLabel(startDate)} to{" "}
                {formatDateLabel(endDate)}
              </p>
              {historyError ? (
                <div className="status-banner error">{historyError}</div>
              ) : null}
            </section>

            {historyLoading ? (
              <div className="status-banner">
                Loading historical range data...
              </div>
            ) : (
              <>
                <section className="overview-grid compact">
                  <article className="metric-card">
                    <span>Days in range</span>
                    <strong>{historySummary?.days ?? "--"}</strong>
                    <p>Daily observations included in the analysis.</p>
                  </article>

                  <article className="metric-card">
                    <span>Average max temp</span>
                    <strong>
                      {formatNumber(historySummary?.averageMaxTemp, "\u00B0C")}
                    </strong>
                    <p>Average daily maximum temperature.</p>
                  </article>

                  <article className="metric-card">
                    <span>Total rain</span>
                    <strong>
                      {formatNumber(historySummary?.totalRain, " mm")}
                    </strong>
                    <p>Total precipitation across the selected range.</p>
                  </article>

                  <article className="metric-card">
                    <span>Peak wind</span>
                    <strong>
                      {formatNumber(historySummary?.peakWind, " km/h")}
                    </strong>
                    <p>Strongest daily wind speed in the range.</p>
                  </article>
                </section>

                <section className="charts-grid history-grid">
                  <ChartPanel
                    title="Temperature History"
                    caption="Daily max and min temperature over time."
                  >
                    <WeatherLineChart
                      data={historyChartData}
                      lines={[
                        {
                          dataKey: "maxTemp",
                          name: "Max Temp",
                          stroke: "#ef4444",
                        },
                        {
                          dataKey: "minTemp",
                          name: "Min Temp",
                          stroke: "#3b82f6",
                        },
                      ]}
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="Rain History"
                    caption="Daily precipitation totals for the selected range."
                  >
                    <WeatherLineChart
                      data={historyChartData}
                      lines={[
                        { dataKey: "rain", name: "Rain", stroke: "#14b8a6" },
                      ]}
                    />
                  </ChartPanel>

                  <ChartPanel
                    title="Wind History"
                    caption="Daily maximum wind speed over time."
                  >
                    <WeatherLineChart
                      data={historyChartData}
                      lines={[
                        { dataKey: "wind", name: "Wind", stroke: "#f97316" },
                      ]}
                    />
                  </ChartPanel>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
