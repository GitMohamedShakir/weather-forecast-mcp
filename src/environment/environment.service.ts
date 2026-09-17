import { Injectable } from '@nestjs/common';
import type { Coordinates, EnvironmentSnapshot, EnvironmentalEvent, SourceStatus } from './environment.types.js';
import { NaturalEventsClient } from './natural-events.client.js';
import { OpenMeteoClient } from './open-meteo.client.js';
import { RiskEngineService } from './risk-engine.service.js';

interface CacheEntry { expiresAt: number; value: EnvironmentSnapshot }

@Injectable()
export class EnvironmentService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly openMeteo: OpenMeteoClient,
    private readonly eventsClient: NaturalEventsClient,
    private readonly riskEngine: RiskEngineService,
  ) {}

  async getSnapshot(location: Coordinates, radiusKm = 100, forecastHours = 24): Promise<EnvironmentSnapshot> {
    const cacheKey = [location.latitude.toFixed(3), location.longitude.toFixed(3), radiusKm, forecastHours].join(':');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const generatedAt = new Date().toISOString();
    const [weatherResult, airResult, floodResult, eonetResult, earthquakeResult] = await Promise.allSettled([
      this.openMeteo.getWeather(location, forecastHours),
      this.openMeteo.getAirQuality(location),
      this.openMeteo.getFlood(location),
      this.eventsClient.getEonetEvents(location, radiusKm),
      this.eventsClient.getEarthquakes(location, radiusKm),
    ]);

    const weather = valueOrNull(weatherResult);
    const airQuality = valueOrNull(airResult);
    const flood = valueOrNull(floodResult);
    const nearbyEvents: EnvironmentalEvent[] = [
      ...(valueOrNull(eonetResult) ?? []),
      ...(valueOrNull(earthquakeResult) ?? []),
    ].sort((a, b) => a.distanceKm - b.distanceKm);
    const risks = this.riskEngine.assess({ weather, airQuality, flood, events: nearbyEvents });
    const sources: SourceStatus[] = [
      sourceStatus('Open-Meteo Weather', weatherResult, generatedAt),
      sourceStatus('Open-Meteo Air Quality (CAMS model)', airResult, generatedAt),
      sourceStatus('Open-Meteo Flood (GloFAS model)', floodResult, generatedAt),
      sourceStatus('NASA EONET', eonetResult, generatedAt),
      sourceStatus('USGS Earthquakes', earthquakeResult, generatedAt),
    ];

    const snapshot: EnvironmentSnapshot = {
      location,
      generatedAt,
      radiusKm,
      weather,
      airQuality,
      flood,
      nearbyEvents,
      risks,
      overallRisk: this.riskEngine.overall(risks),
      sources,
    };
    this.cache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, value: snapshot });
    return snapshot;
  }
}

function valueOrNull<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}
function sourceStatus<T>(name: string, result: PromiseSettledResult<T>, retrievedAt: string): SourceStatus {
  return result.status === 'fulfilled'
    ? { name, status: 'ok', retrievedAt }
    : { name, status: 'unavailable', retrievedAt, detail: result.reason instanceof Error ? result.reason.message : 'Unknown provider error' };
}
