import { Injectable } from '@nestjs/common';
import type { Coordinates, EnvironmentalEvent } from './environment.types.js';
import { HttpClient } from './http-client.js';

interface EonetEvent {
  id: string;
  title: string;
  link?: string;
  categories?: Array<{ id?: string; title?: string }>;
  geometry?: Array<{ date?: string; type?: string; coordinates?: number[] }>;
  sources?: Array<{ id?: string; url?: string }>;
}
interface EonetResponse { events?: EonetEvent[] }
interface UsgsFeature {
  id: string;
  geometry?: { coordinates?: number[] };
  properties?: { title?: string; time?: number; mag?: number; url?: string };
}
interface UsgsResponse { features?: UsgsFeature[] }

@Injectable()
export class NaturalEventsClient {
  constructor(private readonly http: HttpClient) {}

  async getEonetEvents(center: Coordinates, radiusKm: number): Promise<EnvironmentalEvent[]> {
    const bounds = boundingBox(center, radiusKm);
    const url = new URL('https://eonet.gsfc.nasa.gov/api/v3/events');
    url.searchParams.set('status', 'open');
    url.searchParams.set('days', '30');
    url.searchParams.set('limit', '200');
    url.searchParams.set('bbox', `${bounds.minLongitude},${bounds.maxLatitude},${bounds.maxLongitude},${bounds.minLatitude}`);
    const data = await this.http.getJson<EonetResponse>(url);

    return (data.events ?? []).map((event): EnvironmentalEvent | null => {
      const geometry = event.geometry?.at(-1);
      const longitude = geometry?.coordinates?.[0];
      const latitude = geometry?.coordinates?.[1];
      if (geometry?.type !== 'Point' || typeof latitude !== 'number' || typeof longitude !== 'number') return null;
      const category = event.categories?.[0]?.id ?? event.categories?.[0]?.title ?? '';
      return {
        id: event.id,
        type: normalizeEventType(category),
        title: event.title,
        occurredAt: geometry.date ?? new Date().toISOString(),
        latitude,
        longitude,
        distanceKm: round(haversineKm(center, { latitude, longitude }), 1),
        source: `NASA EONET${event.sources?.[0]?.id ? ` / ${event.sources[0].id}` : ''}`,
        url: event.sources?.[0]?.url ?? event.link,
      };
    }).filter((event): event is EnvironmentalEvent => Boolean(event))
      .filter((event) => event.distanceKm <= radiusKm);
  }

  async getEarthquakes(center: Coordinates, radiusKm: number): Promise<EnvironmentalEvent[]> {
    const url = new URL('https://earthquake.usgs.gov/fdsnws/event/1/query');
    url.searchParams.set('format', 'geojson');
    url.searchParams.set('latitude', String(center.latitude));
    url.searchParams.set('longitude', String(center.longitude));
    url.searchParams.set('maxradiuskm', String(Math.min(radiusKm, 20_000)));
    url.searchParams.set('starttime', new Date(Date.now() - 7 * 86_400_000).toISOString());
    url.searchParams.set('minmagnitude', '2.5');
    url.searchParams.set('orderby', 'time');
    url.searchParams.set('limit', '100');
    const data = await this.http.getJson<UsgsResponse>(url);

    return (data.features ?? []).map((feature): EnvironmentalEvent | null => {
      const longitude = feature.geometry?.coordinates?.[0];
      const latitude = feature.geometry?.coordinates?.[1];
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
      return {
        id: feature.id,
        type: 'earthquake',
        title: feature.properties?.title ?? 'Earthquake',
        occurredAt: new Date(feature.properties?.time ?? Date.now()).toISOString(),
        latitude,
        longitude,
        distanceKm: round(haversineKm(center, { latitude, longitude }), 1),
        magnitude: feature.properties?.mag,
        source: 'USGS',
        url: feature.properties?.url,
      };
    }).filter((event): event is EnvironmentalEvent => Boolean(event));
  }
}

function normalizeEventType(category: string): EnvironmentalEvent['type'] {
  const value = category.toLowerCase();
  if (value.includes('wildfire')) return 'wildfire';
  if (value.includes('storm') || value.includes('cyclone')) return 'storm';
  if (value.includes('volcano')) return 'volcano';
  if (value.includes('flood')) return 'flood';
  return 'other';
}

function boundingBox(center: Coordinates, radiusKm: number) {
  const latitudeDelta = radiusKm / 111;
  const longitudeDelta = radiusKm / Math.max(10, 111 * Math.cos((center.latitude * Math.PI) / 180));
  return {
    minLatitude: Math.max(-90, center.latitude - latitudeDelta),
    maxLatitude: Math.min(90, center.latitude + latitudeDelta),
    minLongitude: Math.max(-180, center.longitude - longitudeDelta),
    maxLongitude: Math.min(180, center.longitude + longitudeDelta),
  };
}

function haversineKm(a: Coordinates, b: Coordinates): number {
  const earthRadiusKm = 6_371;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const term = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
}
function toRadians(value: number): number { return (value * Math.PI) / 180 }
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
