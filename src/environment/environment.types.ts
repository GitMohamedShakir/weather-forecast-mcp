export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type RiskSeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface ForecastHour {
  time: string;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  precipitationMm: number | null;
  precipitationProbability: number | null;
  windSpeedKmh: number | null;
  weatherCode: number | null;
}

export interface WeatherReading {
  observedAt: string;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  relativeHumidityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDegrees: number | null;
  windGustKmh: number | null;
  weatherCode: number | null;
  forecast: ForecastHour[];
}

export interface AirQualityReading {
  observedAt: string;
  usAqi: number | null;
  europeanAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  ozone: number | null;
  nitrogenDioxide: number | null;
  carbonMonoxide: number | null;
  dust: number | null;
}

export interface FloodReading {
  observedAt: string;
  riverDischargeM3s: number | null;
  forecast: Array<{ date: string; riverDischargeM3s: number | null }>;
}

export interface EnvironmentalEvent {
  id: string;
  type: 'wildfire' | 'storm' | 'volcano' | 'flood' | 'earthquake' | 'other';
  title: string;
  occurredAt: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  magnitude?: number;
  source: string;
  url?: string;
}

export interface EnvironmentalRisk {
  type: string;
  severity: RiskSeverity;
  score: number;
  headline: string;
  reasons: string[];
  recommendation: string;
}

export interface SourceStatus {
  name: string;
  status: 'ok' | 'unavailable' | 'not_configured';
  retrievedAt: string;
  detail?: string;
}

export interface EnvironmentSnapshot {
  location: Coordinates;
  generatedAt: string;
  radiusKm: number;
  weather: WeatherReading | null;
  airQuality: AirQualityReading | null;
  flood: FloodReading | null;
  nearbyEvents: EnvironmentalEvent[];
  risks: EnvironmentalRisk[];
  overallRisk: {
    severity: RiskSeverity;
    score: number;
    summary: string;
  };
  sources: SourceStatus[];
}
