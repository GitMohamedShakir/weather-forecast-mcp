/// <reference path="./node-runtime.d.ts" />

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { AppModule } from './app.module.js';
import { McpServerFactory } from './mcp/mcp-server.factory.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const factory = app.get(McpServerFactory);
  const handle = serveStdio(() => factory.create(), {
    onerror: (error) => console.error('EarthPulse stdio error:', error),
  });

  const shutdown = async () => {
    await handle.close();
    await app.close();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

void bootstrap();
