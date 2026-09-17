import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  health() {
    return {
      name: 'EarthPulse MCP',
      status: 'ok',
      mcpEndpoint: '/mcp',
      transports: ['streamable-http', 'stdio'],
      widget: 'MCP Apps-compatible hosts only; structured JSON works in every MCP client.',
    };
  }
}
