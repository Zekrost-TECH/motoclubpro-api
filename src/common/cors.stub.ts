import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppControllerStub {
    @Get('ping')
    ping(): { ok: boolean } {
        return { ok: true };
    }
}
