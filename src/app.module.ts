import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { EnvironmentService } from './environment/environment.service.js';
import { HttpClient } from './environment/http-client.js';
import { NaturalEventsClient } from './environment/natural-events.client.js';
import { OpenMeteoClient } from './environment/open-meteo.client.js';
import { RiskEngineService } from './environment/risk-engine.service.js';
import { McpServerFactory } from './mcp/mcp-server.factory.js';

@Module({
  controllers: [AppController],
  providers: [HttpClient, OpenMeteoClient, NaturalEventsClient, RiskEngineService, EnvironmentService, McpServerFactory],
})
export class AppModule {}
