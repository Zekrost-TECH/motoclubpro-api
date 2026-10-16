import {
    Controller,
    Post,
    Body,
    UseGuards,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { TrackerAccessGuard } from '../auth/guards/tracker-access.guard';
import { TrackerService } from './tracker.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { BatchPositionsDto } from './dto/batch-positions.dto';
import type { AuthRequest } from '../auth/auth.types';

@Controller('tracker')
@ApiTags('tracker')
@ApiBearerAuth()
export class TrackerController {
    constructor(private readonly trackerService: TrackerService) { }

    @Post('session')
    @UseGuards(JwtAuthGuard, ClubGuard)
    @ApiOperation({
        summary: 'Token de tracking',
        description: 'Emite un token de larga duración con scope limitado a publicar posiciones en este evento. Lo usa el servicio nativo de Android para reportar GPS sin depender del WebView.',
    })
    @ApiBearerAuth()
    async createSession(
        @Request() req: AuthRequest,
        @Body('eventId') eventId: string,
    ): Promise<{ tracking_token: string; expires_in: number }> {
        return this.trackerService.createTrackingToken(req.user, eventId);
    }

    @Post('position')
    @UseGuards(TrackerAccessGuard, ClubGuard)
    @ApiOperation({ summary: 'Guardar posición', description: 'Guarda la posición GPS del usuario autenticado' })
    @ApiBearerAuth()
    async savePosition(
        @Request() req: AuthRequest,
        @Body() dto: CreatePositionDto,
    ): Promise<{ saved: boolean }> {
        return this.trackerService.savePosition(req.user, dto);
    }

    @Post('positions')
    @UseGuards(TrackerAccessGuard, ClubGuard)
    @ApiOperation({
        summary: 'Guardar posiciones en batch',
        description: 'Cola offline del servicio nativo: sube hasta 200 posiciones acumuladas de una sola vez.',
    })
    @ApiBearerAuth()
    async savePositions(
        @Request() req: AuthRequest,
        @Body() dto: BatchPositionsDto,
    ): Promise<{ saved: number }> {
        return this.trackerService.savePositions(req.user, dto);
    }
}
