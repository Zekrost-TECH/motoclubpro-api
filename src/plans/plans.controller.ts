import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Controller('plans')
@UseGuards(JwtAuthGuard, ClubGuard)
export class PlansController {
    constructor(private readonly plansService: PlansService) { }

    @Get('limits')
    async getLimits(@CurrentClub() clubId: string) {
        return this.plansService.getClubLimits(clubId);
    }
}
