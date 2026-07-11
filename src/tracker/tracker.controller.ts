import {
    Controller,
    Post,
    Body,
    UseGuards,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { TrackerService } from './tracker.service';
import { CreatePositionDto } from './dto/create-position.dto';
import type { AuthRequest } from '../auth/auth.types';

@Controller('tracker')
@ApiTags('tracker')
@UseGuards(JwtAuthGuard, ClubGuard)
@ApiBearerAuth()
export class TrackerController {
    constructor(private readonly trackerService: TrackerService) { }

    @Post('position')
    async savePosition(
        @Request() req: AuthRequest,
        @Body() dto: CreatePositionDto,
    ): Promise<{ saved: boolean }> {
        return this.trackerService.savePosition(req.user, dto);
    }
}
