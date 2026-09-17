/// <reference path="./node-runtime.d.ts" />

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module.js';
import { McpServerFactory } from './mcp/mcp-server.factory.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableShutdownHooks();

  const serverFactory = app.get(McpServerFactory);
  const handler = createMcpHandler(() => serverFactory.create());
  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => console.error('MCP transport error', error),
  });

  const allowedHosts = (process.env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1,[::1]')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const validateHost = hostHeaderValidation(allowedHosts);
  const validateOrigin = originValidation(allowedHosts);

  app.use('/mcp', (request: IncomingMessage, response: ServerResponse) => {
    if (!validateHost(request, response) || !validateOrigin(request, response)) return;
    void nodeHandler(request, response);
  });

  const closeHandler = handler.close;
  process.once('SIGTERM', () => void closeHandler());
  process.once('SIGINT', () => void closeHandler());

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  console.log(`EarthPulse MCP listening on http://${host}:${port}/mcp`);
}

void bootstrap();
