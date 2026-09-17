import { describe, expect, it } from 'vitest';
import { RiskEngineService } from '../src/environment/risk-engine.service.js';
import type { AirQualityReading, FloodReading, WeatherReading } from '../src/environment/environment.types.js';

const baseWeather: WeatherReading = {
  observedAt: '2026-09-17T08:00:00Z',
  temperatureC: 31,
  apparentTemperatureC: 32,
  relativeHumidityPercent: 75,
  precipitationMm: 0,
  windSpeedKmh: 12,
  windDirectionDegrees: 180,
  windGustKmh: 20,
  weatherCode: 1,
  forecast: Array.from({ length: 6 }, (_, index) => ({
    time: `2026-09-17T${String(8 + index).padStart(2, '0')}:00:00Z`,
    temperatureC: 31,
    apparentTemperatureC: 32,
    precipitationMm: 0,
    precipitationProbability: 0,
    windSpeedKmh: 12,
    weatherCode: 1,
  })),
};

const cleanAir: AirQualityReading = {
  observedAt: '2026-09-17T08:00:00Z', usAqi: 30, europeanAqi: 20,
  pm25: 6, pm10: 10, ozone: 20, nitrogenDioxide: 5, carbonMonoxide: 100, dust: 0,
};

describe('RiskEngineService', () => {
  const engine = new RiskEngineService();

  it('detects a compound outdoor health risk', () => {
    const risks = engine.assess({
      weather: { ...baseWeather, apparentTemperatureC: 38 },
      airQuality: { ...cleanAir, usAqi: 165, pm25: 72 },
      flood: null,
      events: [],
    });
    expect(risks.map((risk) => risk.type)).toContain('compound_outdoor_health');
    expect(engine.overall(risks).severity).toBe('high');
  });

  it('correlates heavy rain with rising river discharge', () => {
    const flood: FloodReading = {
      observedAt: '2026-09-17',
      riverDischargeM3s: 100,
      forecast: [
        { date: '2026-09-17', riverDischargeM3s: 100 },
        { date: '2026-09-18', riverDischargeM3s: 180 },
        { date: '2026-09-19', riverDischargeM3s: 210 },
      ],
    };
    const rainy = {
      ...baseWeather,
      forecast: baseWeather.forecast.map((hour) => ({ ...hour, precipitationMm: 5 })),
    };
    const risks = engine.assess({ weather: rainy, airQuality: cleanAir, flood, events: [] });
    expect(risks.find((risk) => risk.type === 'compound_flood')?.severity).toBe('high');
  });
});
