import { Injectable } from '@nestjs/common';
import type { AirQualityReading, EnvironmentalEvent, EnvironmentalRisk, FloodReading, RiskSeverity, WeatherReading } from './environment.types.js';

interface RiskInput {
  weather: WeatherReading | null;
  airQuality: AirQualityReading | null;
  flood: FloodReading | null;
  events: EnvironmentalEvent[];
}

@Injectable()
export class RiskEngineService {
  assess(input: RiskInput): EnvironmentalRisk[] {
    const risks: EnvironmentalRisk[] = [];
    const heat = input.weather?.apparentTemperatureC;
    const aqi = input.airQuality?.usAqi;
    const nextSixHoursRain = sum(input.weather?.forecast.slice(0, 6).map((hour) => hour.precipitationMm) ?? []);
    const gust = input.weather?.windGustKmh;
    const dischargeTrend = riverRiseRatio(input.flood);

    if (heat != null && heat >= 30) {
      const severity = heat >= 40 ? 'critical' : heat >= 35 ? 'high' : 'moderate';
      risks.push(risk('heat_stress', severity, `Heat stress is ${severity}`, [`Apparent temperature is ${round(heat)}°C.`],
        severity === 'moderate' ? 'Reduce strenuous activity and stay hydrated.' : 'Avoid strenuous outdoor activity during the hottest hours.'));
    }
    if (aqi != null && aqi >= 100) {
      const severity = aqi >= 200 ? 'critical' : aqi >= 150 ? 'high' : 'moderate';
      risks.push(risk('air_quality', severity, `Air quality is ${severity}`,
        [`US AQI is ${round(aqi)}${input.airQuality?.pm25 ? `; PM2.5 is ${round(input.airQuality.pm25)} µg/m³` : ''}.`],
        'Sensitive groups should reduce prolonged outdoor exertion.'));
    }
    if (nextSixHoursRain >= 10) {
      const severity = nextSixHoursRain >= 50 ? 'critical' : nextSixHoursRain >= 25 ? 'high' : 'moderate';
      risks.push(risk('heavy_rain', severity, `Heavy rainfall risk is ${severity}`,
        [`${round(nextSixHoursRain)} mm is forecast during the next six hours.`], 'Monitor local drainage and avoid flood-prone roads.'));
    }
    if (gust != null && gust >= 50) {
      const severity = gust >= 90 ? 'critical' : gust >= 70 ? 'high' : 'moderate';
      risks.push(risk('strong_wind', severity, `Strong-wind risk is ${severity}`,
        [`Wind gusts are ${round(gust)} km/h.`], 'Secure loose objects and avoid exposed areas.'));
    }
    if (nextSixHoursRain >= 10 && dischargeTrend != null && dischargeTrend >= 1.25) {
      const severity = nextSixHoursRain >= 25 || dischargeTrend >= 1.75 ? 'high' : 'moderate';
      risks.push(risk('compound_flood', severity, `Compound flood risk is ${severity}`,
        [`${round(nextSixHoursRain)} mm of rain is forecast in six hours.`, `Nearby modeled river discharge rises by ${round((dischargeTrend - 1) * 100)}%.`],
        'Follow local flood warnings and prepare an alternate route to higher ground.'));
    }
    const wildfire = input.events.find((event) => event.type === 'wildfire' && event.distanceKm <= 150);
    if (wildfire) {
      const smokeSignal = (input.airQuality?.pm25 ?? 0) >= 35 || (gust ?? 0) >= 35;
      risks.push(risk('nearby_wildfire', smokeSignal ? 'high' : 'moderate',
        smokeSignal ? 'Nearby fire may affect local air' : 'Wildfire detected nearby',
        [`${wildfire.title} is approximately ${round(wildfire.distanceKm)} km away.`, ...(smokeSignal ? ['Air or wind conditions can increase smoke exposure.'] : [])],
        'Watch official fire guidance and limit smoke exposure if visibility or air quality worsens.'));
    }
    const earthquake = input.events.find((event) => event.type === 'earthquake' && (event.magnitude ?? 0) >= 4);
    if (earthquake) {
      const magnitude = earthquake.magnitude ?? 0;
      const severity = magnitude >= 6 ? 'critical' : magnitude >= 5 ? 'high' : 'moderate';
      risks.push(risk('earthquake', severity, `Recent earthquake risk is ${severity}`,
        [`Magnitude ${magnitude.toFixed(1)} earthquake detected ${round(earthquake.distanceKm)} km away.`],
        'Check instructions from local emergency authorities and be alert for aftershocks.'));
    }
    if ((heat ?? 0) >= 35 && (aqi ?? 0) >= 100) {
      risks.push(risk('compound_outdoor_health', 'high', 'Combined heat and air pollution make outdoor activity unsafe',
        [`Apparent temperature is ${round(heat ?? 0)}°C.`, `US AQI is ${round(aqi ?? 0)}.`],
        'Move sustained activity indoors or reschedule it for a cooler, cleaner period.'));
    }
    return risks.sort((a, b) => b.score - a.score);
  }

  overall(risks: EnvironmentalRisk[]) {
    if (risks.length === 0) return { severity: 'low' as const, score: 10, summary: 'No elevated environmental risks were detected from the available feeds.' };
    const highest = risks[0]!;
    const score = Math.min(100, highest.score + Math.min(10, (risks.length - 1) * 3));
    return { severity: severityForScore(score), score, summary: `${highest.headline}. ${highest.recommendation}` };
  }
}

function risk(type: string, severity: RiskSeverity, headline: string, reasons: string[], recommendation: string): EnvironmentalRisk {
  return { type, severity, score: { low: 20, moderate: 50, high: 75, critical: 95 }[severity], headline, reasons, recommendation };
}
function severityForScore(score: number): RiskSeverity {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}
function sum(values: Array<number | null>): number { return values.reduce<number>((total, value) => total + (value ?? 0), 0) }
function riverRiseRatio(flood: FloodReading | null): number | null {
  const current = flood?.riverDischargeM3s;
  if (current == null || current <= 0) return null;
  const upcoming = flood?.forecast.slice(1, 4).map((day) => day.riverDischargeM3s).filter((value): value is number => value !== null);
  return upcoming?.length ? Math.max(...upcoming) / current : null;
}
function round(value: number): number { return Math.round(value * 10) / 10 }
