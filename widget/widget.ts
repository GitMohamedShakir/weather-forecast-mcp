import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';

interface Hour { time: string; temperatureC: number | null; apparentTemperatureC: number | null; precipitationMm: number | null; precipitationProbability: number | null; windSpeedKmh: number | null; weatherCode: number | null }
interface Snapshot {
  location: { latitude: number; longitude: number };
  generatedAt: string;
  radiusKm: number;
  weather: null | { temperatureC: number | null; apparentTemperatureC: number | null; relativeHumidityPercent: number | null; windSpeedKmh: number | null; weatherCode: number | null; forecast: Hour[] };
  airQuality: null | { usAqi: number | null; pm25: number | null };
  flood: null | { riverDischargeM3s: number | null };
  nearbyEvents: Array<{ type: string; title: string; distanceKm: number; magnitude?: number; source: string }>;
  risks: Array<{ severity: string; headline: string; reasons: string[]; recommendation: string }>;
  overallRisk: { severity: string; score: number; summary: string };
  sources: Array<{ name: string; status: string }>;
}

const root = document.querySelector<HTMLElement>('#app')!;
// ChatGPT hosts the dashboard inside a sandboxed iframe. Keep the bridge small
// and handle every view error locally so a malformed/partial data point never
// turns into an "Error loading app" host-level failure.
const app = new App(
  { name: 'EarthPulse Dashboard', version: '0.1.0' },
  {},
  { autoResize: false },
);

function showWidgetError(prefix: string, error: unknown) {
  console.error(prefix, error);
  const message = error instanceof Error ? error.message : String(error);
  root.className = 'cloudy';
  root.innerHTML = `<div class="empty">${escapeHtml(prefix)}<br><small>${escapeHtml(message)}</small></div>`;
}

app.addEventListener('toolresult', (result) => {
  try {
    const snapshot = result.structuredContent as unknown as Snapshot | undefined;
    if (snapshot?.overallRisk) render(snapshot);
    else root.innerHTML = '<div class="empty">The tool returned no dashboard data.</div>';
  } catch (error) {
    showWidgetError('The environmental dashboard could not render.', error);
  }
});
app.addEventListener('toolcancelled', () => {
  root.innerHTML = '<div class="empty">Environmental lookup was cancelled.</div>';
});

window.addEventListener('error', (event) => showWidgetError('The environmental dashboard encountered an error.', event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showWidgetError('The environmental dashboard encountered an error.', event.reason));

void app.connect(new PostMessageTransport(window.parent, window.parent)).catch((error) => {
  showWidgetError('Widget connection failed.', error);
});

function render(snapshot: Snapshot) {
  const weather = snapshot.weather;
  const hours = weather?.forecast.slice(0, 24) ?? [];
  const sourceCount = snapshot.sources.filter((source) => source.status === 'ok').length;
  const selected = Math.max(0, hours.findIndex((hour) => isCurrentHour(hour.time)));
  root.className = skyClass(weather?.weatherCode);
  root.innerHTML = markup(snapshot, hours, selected, sourceCount);
  bindForecast(snapshot, hours, selected);
}

function markup(snapshot: Snapshot, hours: Hour[], selected: number, sourceCount: number): string {
  const weather = snapshot.weather;
  const overallColor = riskColor(snapshot.overallRisk.severity);
  return `
    <div class="ambient"><div class="orb"></div><div class="cloud one"></div><div class="cloud two"></div><div class="rain"></div></div>
    <div class="top"><div class="brand">EARTH<b>PULSE</b></div><div class="stamp">Live environmental intelligence · ${formatTime(snapshot.generatedAt)}</div></div>
    <section class="hero">
      <article class="now"><div class="eyebrow">Now · ${formatCoordinates(snapshot.location)}</div><div class="temperature">${value(weather?.temperatureC)}<span>°</span></div><div class="condition">${conditionLabel(weather?.weatherCode)}</div><div class="subline">Feels like ${value(weather?.apparentTemperatureC)}° · Wind ${value(weather?.windSpeedKmh)} km/h</div><div class="selected-time" id="selected-time">Select an hour to explore the forecast</div></article>
      <article class="score"><div class="eyebrow">Environmental risk</div><div class="dial" style="--score:${snapshot.overallRisk.score};--risk:${overallColor}"><strong>${snapshot.overallRisk.score}</strong><small>OUT OF 100</small></div><div class="risk-copy"><strong style="color:${overallColor}">${escapeHtml(snapshot.overallRisk.severity)} risk</strong><span>${escapeHtml(snapshot.overallRisk.summary)}</span></div></article>
    </section>
    <section class="metrics">
      ${metric('US AQI', value(snapshot.airQuality?.usAqi), aqiHint(snapshot.airQuality?.usAqi))}
      ${metric('PM2.5', value(snapshot.airQuality?.pm25), 'µg/m³')}
      ${metric('Humidity', value(weather?.relativeHumidityPercent), '%')}
      ${metric('River flow', value(snapshot.flood?.riverDischargeM3s), 'm³/s')}
    </section>
    <section class="chart-card">
      <div class="chart-head"><div><div class="section-title">Interactive hourly outlook</div><div class="legend">Tap an hour or a point to update the sky and details</div></div><div class="legend">${hours.length}h forecast</div></div>
      ${temperatureGraph(hours, selected)}
      <div class="axis"><span>${hours[0] ? formatHour(hours[0].time) : 'Now'}</span><span>${hours.length ? formatHour(hours[hours.length - 1]!.time) : '—'}</span></div>
      <div class="forecast-scroll"><div class="hour-strip">${hourCards(hours, selected)}</div></div>
    </section>
    <section class="lower">
      <article class="insights"><div class="section-title">Risk signals</div>${riskCards(snapshot.risks)}</article>
      <aside><div class="section-title">Nearby events</div><div class="events">${eventCards(snapshot.nearbyEvents)}</div></aside>
    </section>
    <div class="sources">${sourceCount}/${snapshot.sources.length} live sources responded. Data is decision support, not an official emergency warning.</div>`;
}

function temperatureGraph(hours: Hour[], selected: number): string {
  if (!hours.length) return '<div class="empty">Hourly forecast unavailable.</div>';
  const values = hours.map((hour) => hour.temperatureC ?? 0);
  const min = Math.min(...values), max = Math.max(...values), range = Math.max(1, max - min);
  const points = values.map((temperature, index) => ({ x: 5 + (index / Math.max(1, values.length - 1)) * 90, y: 82 - ((temperature - min) / range) * 62 }));
  const line = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const area = `5,96 ${line} 95,96`;
  return `<div class="graph-wrap"><svg class="temp-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Temperature forecast"><defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7de9ff" stop-opacity=".38"/><stop offset="1" stop-color="#7de9ff" stop-opacity="0"/></linearGradient></defs><polygon class="area" points="${area}"/><polyline points="${line}"/>${points.map((point, index) => `<circle class="point ${index === selected ? 'active' : ''}" data-index="${index}" cx="${point.x}" cy="${point.y}" r="3.2"/>`).join('')}</svg></div>`;
}

function hourCards(hours: Hour[], selected: number): string {
  const maxRain = Math.max(1, ...hours.map((hour) => hour.precipitationMm ?? 0));
  return hours.map((hour, index) => {
    const rain = hour.precipitationMm ?? 0;
    const height = rain ? Math.max(4, (rain / maxRain) * 30) : 2;
    return `<button class="hour ${index === selected ? 'active' : ''}" data-index="${index}" title="${formatHour(hour.time)}"><span class="time">${index === 0 ? 'NOW' : formatHour(hour.time)}</span><span class="weather-icon">${weatherEmoji(hour.weatherCode)}</span><span class="temp">${value(hour.temperatureC)}°</span><span class="rainbar"><i style="height:${height}px"></i></span></button>`;
  }).join('');
}

function bindForecast(snapshot: Snapshot, hours: Hour[], initial: number) {
  const select = (index: number) => {
    const hour = hours[index];
    if (!hour) return;
    root.querySelectorAll<HTMLElement>('.hour').forEach((item) => item.classList.toggle('active', Number(item.dataset.index) === index));
    root.querySelectorAll<SVGCircleElement>('.point').forEach((item) => item.classList.toggle('active', Number(item.dataset.index) === index));
    root.className = skyClass(hour.weatherCode);
    const detail = root.querySelector<HTMLElement>('#selected-time');
    if (detail) { detail.classList.add('show'); detail.textContent = `${formatHour(hour.time)} · ${conditionLabel(hour.weatherCode)} · ${value(hour.temperatureC)}° · ${value(hour.precipitationProbability)}% rain chance`; }
    const temperature = root.querySelector<HTMLElement>('.temperature');
    const condition = root.querySelector<HTMLElement>('.condition');
    const subline = root.querySelector<HTMLElement>('.subline');
    if (temperature) temperature.innerHTML = `${value(hour.temperatureC)}<span>°</span>`;
    if (condition) condition.textContent = conditionLabel(hour.weatherCode);
    if (subline) subline.textContent = `Feels like ${value(hour.apparentTemperatureC)}° · Wind ${value(hour.windSpeedKmh)} km/h`;
  };
  root.querySelectorAll<HTMLElement>('[data-index]').forEach((element) => element.addEventListener('click', () => select(Number(element.dataset.index))));
  select(initial);
  void snapshot;
}

function riskCards(risks: Snapshot['risks']): string {
  return risks.length ? risks.slice(0, 4).map((risk) => `<article class="risk" style="--risk:${riskColor(risk.severity)}"><h3>${escapeHtml(risk.headline)}</h3><p>${escapeHtml(risk.reasons.join(' '))}</p></article>`).join('') : '<div class="empty">No elevated risks found in the available feeds.</div>';
}
function eventCards(events: Snapshot['nearbyEvents']): string {
  return events.length ? events.slice(0, 4).map((event) => `<article class="event"><strong>${weatherEmojiForEvent(event.type)} ${escapeHtml(event.title)}</strong><p>${escapeHtml(event.type)} · ${event.distanceKm.toFixed(1)} km${event.magnitude ? ` · M${event.magnitude.toFixed(1)}` : ''}</p></article>`).join('') : '<div class="empty">No tracked events in this radius.</div>';
}
function metric(label: string, main: string, unit: string): string { return `<article class="metric"><label>${label}</label><strong>${main}</strong><small>${unit}</small></article>`; }
function value(input: number | null | undefined): string { return input == null ? '—' : String(Math.round(input * 10) / 10); }
function aqiHint(aqi: number | null | undefined): string { return aqi == null ? 'unavailable' : aqi <= 50 ? 'good' : aqi <= 100 ? 'moderate' : aqi <= 150 ? 'sensitive groups' : 'unhealthy'; }
function skyClass(code: number | null | undefined): string { return code != null && code >= 95 ? 'storm' : code != null && code >= 51 ? 'rainy' : code != null && code >= 3 ? 'cloudy' : 'clear'; }
function conditionLabel(code: number | null | undefined): string { if (code == null) return 'Conditions unavailable'; if (code >= 95) return 'Thunderstorm'; if (code >= 80) return 'Rain showers'; if (code >= 61) return 'Rain'; if (code >= 51) return 'Drizzle'; if (code >= 45) return 'Fog'; if (code >= 3) return 'Overcast'; if (code >= 2) return 'Partly cloudy'; return 'Clear sky'; }
function weatherEmoji(code: number | null | undefined): string { if (code == null) return '·'; if (code >= 95) return '⛈'; if (code >= 61) return '🌧'; if (code >= 51) return '🌦'; if (code >= 45) return '🌫'; if (code >= 3) return '☁'; if (code >= 2) return '⛅'; return '☀'; }
function weatherEmojiForEvent(type: string): string { return type === 'wildfire' ? '🔥' : type === 'earthquake' ? '◉' : type === 'storm' ? '🌀' : type === 'flood' ? '🌊' : '◌'; }
function riskColor(severity: string): string { return severity === 'critical' ? '#ff6378' : severity === 'high' ? '#ff875c' : severity === 'moderate' ? '#ffcf67' : '#4be3a4'; }
function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}
function formatHour(value: string): string {
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}
function formatCoordinates(location: Snapshot['location']): string { return `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`; }
function isCurrentHour(value: string): boolean { const hour = new Date(value.endsWith('Z') ? value : `${value}Z`); return Math.abs(hour.getTime() - Date.now()) < 3_600_000; }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!); }
