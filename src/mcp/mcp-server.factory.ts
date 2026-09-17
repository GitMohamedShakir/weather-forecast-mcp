/// <reference path="../node-runtime.d.ts" />

import { Injectable } from '@nestjs/common';
import { registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as z from 'zod/v4';
import { EnvironmentService } from '../environment/environment.service.js';
import type { EnvironmentSnapshot } from '../environment/environment.types.js';

const WIDGET_URI = 'ui://earthpulse/environment-dashboard.html';
const SKYBRIDGE_MIME_TYPE = 'text/html+skybridge';
const locationSchema = {
  latitude: z.number().min(-90).max(90).describe('Latitude in decimal degrees.'),
  longitude: z.number().min(-180).max(180).describe('Longitude in decimal degrees.'),
};

@Injectable()
export class McpServerFactory {
  constructor(private readonly environment: EnvironmentService) {}

  create(): McpServer {
    const server = new McpServer(
      { name: 'earthpulse', version: '0.1.0' },
      {
        instructions:
          'Use get_environment_snapshot for current environmental conditions and compound risk. ' +
          'Measurements and forecasts can be delayed or modeled; always preserve source timestamps and never present the result as an official emergency warning.',
      },
    );

    registerAppTool(
      server,
      'get_environment_snapshot',
      {
        title: 'Environmental snapshot',
        description:
          'Get current weather, modeled air quality, river discharge, nearby natural events, and correlated environmental risks for coordinates. Returns structured data and an optional interactive dashboard.',
        inputSchema: z.object({
          ...locationSchema,
          radiusKm: z.number().min(10).max(2_000).default(100).describe('Radius for natural-event searches.'),
          forecastHours: z.number().int().min(6).max(72).default(24).describe('Hourly weather forecast horizon.'),
        }),
        annotations: { readOnlyHint: true, openWorldHint: true },
        _meta: {
          ui: { resourceUri: WIDGET_URI, visibility: ['model', 'app'] },
          'openai/outputTemplate': WIDGET_URI,
          'openai/toolInvocation/invoking': 'Building environmental dashboard…',
          'openai/toolInvocation/invoked': 'Environmental dashboard ready',
        },
      },
      async ({ latitude, longitude, radiusKm, forecastHours }) => {
        try {
          const snapshot = await this.environment.getSnapshot(
            { latitude, longitude },
            radiusKm,
            forecastHours,
          );
          return toolResult(snapshotSummary(snapshot), snapshot);
        } catch (error) {
          return toolError(error);
        }
      },
    );

    server.registerTool(
      'assess_environmental_risk',
      {
        title: 'Environmental risk assessment',
        description:
          'Assess compound risks such as heat plus air pollution, heavy rain plus rising river discharge, wildfire smoke, strong wind, and recent earthquakes.',
        inputSchema: z.object({
          ...locationSchema,
          radiusKm: z.number().min(10).max(2_000).default(100),
        }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ latitude, longitude, radiusKm }) => {
        try {
          const snapshot = await this.environment.getSnapshot({ latitude, longitude }, radiusKm, 24);
          const output = {
            location: snapshot.location,
            generatedAt: snapshot.generatedAt,
            overallRisk: snapshot.overallRisk,
            risks: snapshot.risks,
            sources: snapshot.sources,
          };
          return toolResult(snapshot.overallRisk.summary, output);
        } catch (error) {
          return toolError(error);
        }
      },
    );

    server.registerTool(
      'get_nearby_environmental_events',
      {
        title: 'Nearby environmental events',
        description:
          'Find currently open NASA natural events and earthquakes from the last seven days near coordinates.',
        inputSchema: z.object({
          ...locationSchema,
          radiusKm: z.number().min(10).max(2_000).default(250),
        }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ latitude, longitude, radiusKm }) => {
        try {
          const snapshot = await this.environment.getSnapshot({ latitude, longitude }, radiusKm, 6);
          const output = {
            location: snapshot.location,
            generatedAt: snapshot.generatedAt,
            radiusKm,
            events: snapshot.nearbyEvents,
            sources: snapshot.sources.filter((source) => source.name.includes('NASA') || source.name.includes('USGS')),
          };
          const text = output.events.length
            ? `Found ${output.events.length} environmental event(s) within ${radiusKm} km.`
            : `No tracked NASA EONET or USGS events were found within ${radiusKm} km.`;
          return toolResult(text, output);
        } catch (error) {
          return toolError(error);
        }
      },
    );

    registerAppResource(
      server,
      'EarthPulse environmental dashboard',
      WIDGET_URI,
      {
        description: 'Interactive environmental risk dashboard for EarthPulse snapshots.',
        _meta: { ui: { prefersBorder: true }, 'openai/widgetPrefersBorder': true },
      },
      async () => ({
        contents: [
          {
            uri: WIDGET_URI,
            mimeType: SKYBRIDGE_MIME_TYPE,
            text: loadWidgetHtml(),
            _meta: { ui: { prefersBorder: true }, 'openai/widgetPrefersBorder': true },
          },
        ],
      }),
    );

    return server;
  }
}

function toolResult(text: string, value: object) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: value as Record<string, unknown>,
  };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown environmental data error';
  return { isError: true, content: [{ type: 'text' as const, text: `EarthPulse could not complete the request: ${message}` }] };
}

function snapshotSummary(snapshot: EnvironmentSnapshot): string {
  const weather = snapshot.weather;
  const air = snapshot.airQuality;
  const unavailable = snapshot.sources.filter((source) => source.status !== 'ok').length;
  return [
    `Environmental risk: ${snapshot.overallRisk.severity} (${snapshot.overallRisk.score}/100).`,
    snapshot.overallRisk.summary,
    weather?.temperatureC != null ? `Temperature ${weather.temperatureC}°C; feels like ${weather.apparentTemperatureC ?? weather.temperatureC}°C.` : null,
    air?.usAqi != null ? `US AQI ${air.usAqi}; PM2.5 ${air.pm25 ?? 'unavailable'} µg/m³.` : null,
    `${snapshot.nearbyEvents.length} tracked event(s) within ${snapshot.radiusKm} km.`,
    unavailable ? `${unavailable} source(s) were unavailable; see structured output for details.` : null,
    `Generated ${snapshot.generatedAt}. This is decision support, not an official emergency warning.`,
  ].filter(Boolean).join(' ');
}

function loadWidgetHtml(): string {
  const widgetPath = resolve(process.cwd(), 'dist/widget.html');
  if (existsSync(widgetPath)) return readFileSync(widgetPath, 'utf8');
  return '<!doctype html><html><body><p>EarthPulse widget is not built. Run <code>pnpm run build:widget</code>.</p></body></html>';
}
