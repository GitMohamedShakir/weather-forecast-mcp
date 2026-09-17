import { Injectable } from '@nestjs/common';
import type {
  AirQualityReading,
  Coordinates,
  FloodReading,
  ForecastHour,
  WeatherReading,
} from './environment.types.js';
import { HttpClient } from './http-client.js';

type Numeric = number | null;
interface WeatherResponse {
  current?: Record<string, Numeric | string> & { time?: string };
  hourly?: Record<string, Array<Numeric | string>> & { time?: string[] };
}
interface AirQualityResponse {
  current?: Record<string, Numeric | string> & { time?: string };
}
interface FloodResponse {
  daily?: { time?: string[]; river_discharge?: Numeric[] };
}

@Injectable()
export class OpenMeteoClient {
  constructor(private readonly http: HttpClient) {}

  async getWeather(coordinates: Coordinates, forecastHours = 24): Promise<WeatherReading> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(coordinates.latitude));
    url.searchParams.set('longitude', String(coordinates.longitude));
    url.searchParams.set('current', [
      'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
      'precipitation', 'weather_code', 'wind_speed_10m',
      'wind_direction_10m', 'wind_gusts_10m',
    ].join(','));
    url.searchParams.set('hourly', [
      'temperature_2m', 'apparent_temperature', 'precipitation',
      'precipitation_probability', 'weather_code', 'wind_speed_10m',
    ].join(','));
    url.searchParams.set('forecast_hours', String(forecastHours));
    url.searchParams.set('timezone', 'UTC');

    const data = await this.http.getJson<WeatherResponse>(url);
    const current = data.current ?? {};
    const hourly = data.hourly ?? {};
    const forecast: ForecastHour[] = (hourly.time ?? []).map((time, index) => ({
      time,
      temperatureC: numberAt(hourly.temperature_2m, index),
      apparentTemperatureC: numberAt(hourly.apparent_temperature, index),
      precipitationMm: numberAt(hourly.precipitation, index),
      precipitationProbability: numberAt(hourly.precipitation_probability, index),
      windSpeedKmh: numberAt(hourly.wind_speed_10m, index),
      weatherCode: numberAt(hourly.weather_code, index),
    }));

    return {
      observedAt: stringValue(current.time) ?? new Date().toISOString(),
      temperatureC: numberValue(current.temperature_2m),
      apparentTemperatureC: numberValue(current.apparent_temperature),
      relativeHumidityPercent: numberValue(current.relative_humidity_2m),
      precipitationMm: numberValue(current.precipitation),
      windSpeedKmh: numberValue(current.wind_speed_10m),
      windDirectionDegrees: numberValue(current.wind_direction_10m),
      windGustKmh: numberValue(current.wind_gusts_10m),
      weatherCode: numberValue(current.weather_code),
      forecast,
    };
  }

  async getAirQuality(coordinates: Coordinates): Promise<AirQualityReading> {
    const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    url.searchParams.set('latitude', String(coordinates.latitude));
    url.searchParams.set('longitude', String(coordinates.longitude));
    url.searchParams.set('current', [
      'us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'ozone',
      'nitrogen_dioxide', 'carbon_monoxide', 'dust',
    ].join(','));
    url.searchParams.set('timezone', 'UTC');
    const data = await this.http.getJson<AirQualityResponse>(url);
    const current = data.current ?? {};
    return {
      observedAt: stringValue(current.time) ?? new Date().toISOString(),
      usAqi: numberValue(current.us_aqi),
      europeanAqi: numberValue(current.european_aqi),
      pm25: numberValue(current.pm2_5),
      pm10: numberValue(current.pm10),
      ozone: numberValue(current.ozone),
      nitrogenDioxide: numberValue(current.nitrogen_dioxide),
      carbonMonoxide: numberValue(current.carbon_monoxide),
      dust: numberValue(current.dust),
    };
  }

  async getFlood(coordinates: Coordinates): Promise<FloodReading> {
    const url = new URL('https://flood-api.open-meteo.com/v1/flood');
    url.searchParams.set('latitude', String(coordinates.latitude));
    url.searchParams.set('longitude', String(coordinates.longitude));
    url.searchParams.set('daily', 'river_discharge');
    url.searchParams.set('forecast_days', '7');
    const data = await this.http.getJson<FloodResponse>(url);
    const times = data.daily?.time ?? [];
    const discharge = data.daily?.river_discharge ?? [];
    return {
      observedAt: times[0] ?? new Date().toISOString(),
      riverDischargeM3s: discharge[0] ?? null,
      forecast: times.map((date, index) => ({ date, riverDischargeM3s: discharge[index] ?? null })),
    };
  }
}

function numberAt(values: Array<Numeric | string> | undefined, index: number): Numeric {
  return numberValue(values?.[index]);
}
function numberValue(value: Numeric | string | undefined): Numeric {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function stringValue(value: Numeric | string | undefined): string | null {
  return typeof value === 'string' ? value : null;
}
