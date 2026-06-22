import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('app')
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Version(VERSION_NEUTRAL)
  @Get('health')
  healthCheck(): { status: string } {
    return { status: 'ok' };
  }
}
