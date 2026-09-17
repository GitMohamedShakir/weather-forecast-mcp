import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';

interface Snapshot {
  location: { latitude: number; longitude: number };
  generatedAt: string;
  radiusKm: number;
  weather: null | {
    temperatureC: number | null;
    apparentTemperatureC: number | null;
    relativeHumidityPercent: number | null;
    windSpeedKmh: number | null;
    forecast: Array<{ time: string; precipitationMm: number | null }>;
  };
  airQuality: null | { usAqi: number | null; pm25: number | null };
  flood: null | { riverDischargeM3s: number | null };
  nearbyEvents: Array<{ type: string; title: string; distanceKm: number; magnitude?: number; source: string }>;
  risks: Array<{ severity: string; headline: string; reasons: string[]; recommendation: string }>;
  overallRisk: { severity: string; score: number; summary: string };
  sources: Array<{ name: string; status: string }>;
}

const root = document.querySelector<HTMLElement>('#app')!;
const app = new App({ name: 'EarthPulse Dashboard', version: '0.1.0' }, {});

app.ontoolresult = (result) => {
  const snapshot = result.structuredContent as unknown as Snapshot | undefined;
  if (snapshot?.overallRisk) render(snapshot);
  else root.innerHTML = '<div class="empty">The tool returned no dashboard data.</div>';
};

app.ontoolcancelled = () => {
  root.innerHTML = '<div class="empty">Environmental lookup was cancelled.</div>';
};

void app.connect(new PostMessageTransport(window.parent, window.parent)).catch((error) => {
  root.innerHTML = `<div class="empty">Widget connection failed: ${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
});

function render(snapshot: Snapshot) {
  const color = riskColor(snapshot.overallRisk.severity);
  const weather = snapshot.weather;
  const aqi = snapshot.airQuality;
  const forecast = weather?.forecast.slice(0, 12) ?? [];
  const maxRain = Math.max(1, ...forecast.map((hour) => hour.precipitationMm ?? 0));
  const sourceCount = snapshot.sources.filter((source) => source.status === 'ok').length;

  root.innerHTML = `
    <div class="top"><div class="brand">EARTH<span>PULSE</span></div><div class="stamp">Updated ${formatTime(snapshot.generatedAt)}</div></div>
    <section class="hero" style="--risk:${color}">
      <div class="gauge" style="--score:${snapshot.overallRisk.score};--risk:${color}"><strong>${snapshot.overallRisk.score}</strong><small>RISK / 100</small></div>
      <div><div class="severity">${escapeHtml(snapshot.overallRisk.severity)} risk</div><div class="summary">${escapeHtml(snapshot.overallRisk.summary)}</div><div class="coords">${snapshot.location.latitude.toFixed(4)}, ${snapshot.location.longitude.toFixed(4)} · ${snapshot.radiusKm} km event radius</div></div>
    </section>
    <section class="metrics">
      ${metric('Temperature', value(weather?.temperatureC, '°C'))}
      ${metric('Feels like', value(weather?.apparentTemperatureC, '°C'))}
      ${metric('US AQI', value(aqi?.usAqi))}
      ${metric('PM2.5', value(aqi?.pm25, ' µg/m³'))}
      ${metric('Humidity', value(weather?.relativeHumidityPercent, '%'))}
      ${metric('Wind', value(weather?.windSpeedKmh, ' km/h'))}
      ${metric('River flow', value(snapshot.flood?.riverDischargeM3s, ' m³/s'))}
      ${metric('Nearby events', String(snapshot.nearbyEvents.length))}
    </section>
    <div class="section-title">Next 12 hours · precipitation</div>
    <section class="chart"><div class="bars">${forecast.map((hour) => {
      const rain = hour.precipitationMm ?? 0;
      const height = Math.max(4, (rain / maxRain) * 82);
      return `<div class="bar" style="height:${height}px" data-label="${formatHour(hour.time)} · ${rain.toFixed(1)} mm"></div>`;
    }).join('')}</div></section>
    <div class="section-title">Risk signals</div>
    <section>${snapshot.risks.length ? snapshot.risks.map((item) => `
      <article class="risk" style="--risk-color:${riskColor(item.severity)}"><h3>${escapeHtml(item.headline)}</h3><p>${escapeHtml(item.reasons.join(' '))}</p><p>${escapeHtml(item.recommendation)}</p></article>`).join('') : '<div class="empty">No elevated risks detected from the available feeds.</div>'}</section>
    <div class="section-title">Nearby events</div>
    <section class="events">${snapshot.nearbyEvents.length ? snapshot.nearbyEvents.slice(0, 8).map((event) => `
      <article class="event"><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.type)} · ${event.distanceKm.toFixed(1)} km away${event.magnitude ? ` · magnitude ${event.magnitude.toFixed(1)}` : ''} · ${escapeHtml(event.source)}</p></article>`).join('') : '<div class="empty">No tracked NASA or USGS events in this radius.</div>'}</section>
    <div class="sources">${sourceCount}/${snapshot.sources.length} live sources responded. Model-derived values are decision support, not official emergency warnings.</div>`;
}

function metric(label: string, content: string): string {
  return `<article class="metric"><label>${escapeHtml(label)}</label><strong>${escapeHtml(content)}</strong></article>`;
}
function value(input: number | null | undefined, suffix = ''): string {
  return input == null ? '—' : `${Math.round(input * 10) / 10}${suffix}`;
}
function riskColor(severity: string): string {
  return severity === 'critical' ? '#ff4d67' : severity === 'high' ? '#ff7a59' : severity === 'moderate' ? '#ffca61' : '#4de3a5';
}
function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function formatHour(value: string): string {
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}
