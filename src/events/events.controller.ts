import { UserRole } from '../users/users.types';
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Request,
    Query,
    ForbiddenException,
    ParseArrayPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService, type EventRow, type AttendeeRow, type InventoryRow, type ChecklistItemRow, type GuestRow } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateAttendeeRoleDto } from './dto/update-attendee-role.dto';
import { CreateEventGuestDto } from './dto/create-event-guest.dto';
import { UpdateEventGuestDto } from './dto/update-event-guest.dto';
import { FindEventsQueryDto } from './dto/find-events-query.dto';
import { RespondChecklistItemDto } from './dto/respond-checklist.dto';
import { RsvpDto } from './dto/rsvp.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EventCaptainGuard } from './guards/event-captain.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRoles } from '../auth/decorators/club-role.decorator';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { CurrentClub } from '../auth/decorators/club.decorator';
import type { AuthRequest } from '../auth/auth.types';

@Controller('events')
@ApiTags('events')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class EventsController {
    constructor(private readonly eventsService: EventsService) { }

    @Get()
    @ApiOperation({ summary: 'Listar rodadas', description: 'Obtiene la lista de rodadas del club con filtros y paginación' })
    @ApiBearerAuth()
    findAll(
        @Request() req: AuthRequest,
        @Query('status') status?: string,
        @Query('upcoming') upcoming?: string,
        @CurrentClub() clubId?: string,
        @Query() query?: FindEventsQueryDto,
    ): Promise<{ data: EventRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        if (!clubId && req.user.role !== UserRole.superadmin && req.user.role !== UserRole.admin) {
            throw new ForbiddenException('Se requiere un club activo (x-club-id) para listar rodadas');
        }
        const isUpcoming = upcoming === 'true';
        return this.eventsService.findAll(status, isUpcoming, clubId, query?.page, query?.limit);
    }

    @Get('active')
    @ApiOperation({ summary: 'Rodadas activas', description: 'Obtiene las rodadas en curso de todos los clubes del usuario' })
    @ApiBearerAuth()
    findActive(@Request() req: AuthRequest): Promise<Array<EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] }>> {
        // Rodadas en curso de TODOS los clubes del usuario (ROD-15): no depende
        // del club activo, resuelve membresías desde la BD.
        return this.eventsService.findActiveAcrossClubs(req.user.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener rodada', description: 'Obtiene una rodada por su ID con asistentes, inventario y acompañantes' })
    @ApiBearerAuth()
    findOne(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] }> {
        return this.eventsService.findOne(id, clubId);
    }

    @Post()
    @ApiOperation({ summary: 'Crear rodada', description: 'Crea una nueva rodada en el club activo' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    create(@Body() createEventDto: CreateEventDto, @Request() req: AuthRequest, @CurrentClub() clubId?: string): Promise<EventRow> {
        return this.eventsService.create(createEventDto, req.user.id, clubId, req.user.role);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar rodada', description: 'Actualiza los datos de una rodada existente' })
    @ApiBearerAuth()
    @UseGuards(EventCaptainGuard)
    update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto, @CurrentClub() clubId?: string): Promise<EventRow> {
        return this.eventsService.update(id, updateEventDto, clubId);
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Cambiar estado', description: 'Actualiza el estado de una rodada' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    updateStatus(@Param('id') id: string, @Body() updateEventStatusDto: UpdateEventStatusDto, @CurrentClub() clubId?: string): Promise<EventRow> {
        return this.eventsService.updateStatus(id, updateEventStatusDto.status, clubId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Eliminar rodada', description: 'Elimina una rodada por su ID' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin)
    remove(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<{ deleted: boolean }> {
        return this.eventsService.remove(id, clubId);
    }

    // --- RSVP ---
    @Post(':id/rsvp')
    @ApiOperation({ summary: 'Confirmar asistencia', description: 'Confirma la asistencia del usuario a una rodada con un rol' })
    @ApiBearerAuth()
    rsvp(@Param('id') id: string, @Request() req: AuthRequest, @Body() dto: RsvpDto, @CurrentClub() clubId?: string): Promise<{ success: boolean; message: string }> {
        return this.eventsService.rsvp(id, req.user, dto.rideRole, clubId);
    }

    @Delete(':id/rsvp')
    @ApiOperation({ summary: 'Cancelar asistencia', description: 'Cancela la asistencia del usuario a una rodada' })
    @ApiBearerAuth()
    cancelRsvp(@Param('id') id: string, @Request() req: AuthRequest, @CurrentClub() clubId?: string): Promise<{ deleted: boolean }> {
        return this.eventsService.cancelRsvp(id, req.user.id, clubId);
    }

    @Get(':id/attendees')
    @ApiOperation({ summary: 'Listar asistentes', description: 'Obtiene la lista de asistentes de una rodada' })
    @ApiBearerAuth()
    getAttendees(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<AttendeeRow[]> {
        return this.eventsService.getAttendees(id, clubId);
    }

    @Patch(':id/attendees/:userId')
    @ApiOperation({ summary: 'Actualizar rol asistente', description: 'Actualiza el rol de un asistente dentro de una rodada' })
    @ApiBearerAuth()
    @UseGuards(EventCaptainGuard)
    updateAttendeeRole(
        @Param('id') id: string,
        @Param('userId') userId: string,
        @Body() updateAttendeeRoleDto: UpdateAttendeeRoleDto,
        @CurrentClub() clubId?: string,
    ): Promise<AttendeeRow> {
        return this.eventsService.updateAttendeeRole(
            id,
            userId,
            updateAttendeeRoleDto.ride_role,
            clubId,
        );
    }

    // --- CHECKLIST ---
    @Get(':id/checklist')
    @ApiOperation({ summary: 'Obtener checklist', description: 'Obtiene la lista de items del checklist de una rodada' })
    @ApiBearerAuth()
    getChecklist(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<ChecklistItemRow[]> {
        return this.eventsService.getChecklist(id, clubId);
    }

    @Post(':id/checklist')
    @ApiOperation({ summary: 'Agregar item checklist', description: 'Añade un nuevo item al checklist de una rodada' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    addChecklistItem(
        @Param('id') id: string,
        @Body() dto: CreateChecklistItemDto,
        @CurrentClub() clubId?: string,
    ): Promise<ChecklistItemRow> {
        return this.eventsService.addChecklistItem(id, dto.label, dto.required ?? false, clubId);
    }

    @Delete(':id/checklist/:itemId')
    @ApiOperation({ summary: 'Eliminar item checklist', description: 'Elimina un item del checklist de una rodada' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    removeChecklistItem(
        @Param('id') id: string,
        @Param('itemId') itemId: string,
        @CurrentClub() clubId?: string,
    ): Promise<{ deleted: boolean }> {
        return this.eventsService.removeChecklistItem(id, itemId, clubId);
    }

    @Post(':id/checklist/respond')
    @ApiOperation({ summary: 'Responder checklist', description: 'Registra las respuestas del usuario al checklist de una rodada' })
    @ApiBearerAuth()
    respondChecklist(
        @Param('id') id: string,
        @Request() req: AuthRequest,
        @Body(new ParseArrayPipe({ items: RespondChecklistItemDto })) responses: RespondChecklistItemDto[],
        @CurrentClub() clubId?: string,
    ): Promise<{ success: boolean; checklist_completed: boolean }> {
        return this.eventsService.respondChecklist(id, req.user.id, responses, clubId);
    }

    @Get(':id/checklist/status')
    @ApiOperation({ summary: 'Estado del checklist', description: 'Obtiene el estado de completitud del checklist por usuario' })
    @ApiBearerAuth()
    @UseGuards(EventCaptainGuard)
    getChecklistStatus(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<{ userId: string; name: string; checklist_completed: boolean }[]> {
        return this.eventsService.getChecklistStatus(id, clubId);
    }

    // --- INVENTORY ---
    @Get(':id/inventory')
    @ApiOperation({ summary: 'Obtener inventario', description: 'Obtiene la lista de items del inventario de una rodada' })
    @ApiBearerAuth()
    getInventory(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<InventoryRow[]> {
        return this.eventsService.getInventory(id, clubId);
    }

    @Post(':id/inventory')
    @ApiOperation({ summary: 'Agregar item inventario', description: 'Añade un nuevo item al inventario de una rodada' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    addInventoryItem(@Param('id') id: string, @Body() createInventoryItemDto: CreateInventoryItemDto, @CurrentClub() clubId?: string): Promise<InventoryRow> {
        return this.eventsService.addInventoryItem(id, createInventoryItemDto, clubId);
    }

    @Patch(':id/inventory/:itemId/claim')
    @ApiOperation({ summary: 'Reclamar item inventario', description: 'Reclama un item del inventario de una rodada' })
    @ApiBearerAuth()
    claimInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req: AuthRequest, @CurrentClub() clubId?: string): Promise<InventoryRow> {
        return this.eventsService.claimInventoryItem(id, itemId, req.user.id, clubId);
    }

    @Delete(':id/inventory/:itemId/claim')
    @ApiOperation({ summary: 'Liberar item inventario', description: 'Libera un item del inventario previamente reclamado' })
    @ApiBearerAuth()
    releaseInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req: AuthRequest, @CurrentClub() clubId?: string): Promise<{ released: boolean; item: InventoryRow }> {
        return this.eventsService.releaseInventoryItem(id, itemId, req.user.id, clubId);
    }

    @Delete(':id/inventory/:itemId')
    @ApiOperation({ summary: 'Eliminar item inventario', description: 'Elimina un item del inventario de una rodada' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    removeInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentClub() clubId?: string): Promise<{ deleted: boolean }> {
        return this.eventsService.removeInventoryItem(id, itemId, clubId);
    }

    // --- GUESTS (acompañantes e invitados sin cuenta) ---
    @Get(':id/guests')
    @ApiOperation({ summary: 'Obtener acompañantes', description: 'Obtiene la lista de acompañantes e invitados de una rodada' })
    @ApiBearerAuth()
    getGuests(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<GuestRow[]> {
        return this.eventsService.getGuests(id, clubId);
    }

    @Post(':id/guests')
    @ApiOperation({ summary: 'Agregar acompañante', description: 'Añade un acompañante o invitado sin cuenta a una rodada' })
    @ApiBearerAuth()
    addGuest(
        @Param('id') id: string,
        @Request() req: AuthRequest,
        @Body() dto: CreateEventGuestDto,
        @CurrentClub() clubId?: string,
    ): Promise<GuestRow> {
        return this.eventsService.addGuest(id, req.user.id, dto, clubId);
    }

    @Patch(':id/guests/:guestId')
    @ApiOperation({ summary: 'Actualizar acompañante', description: 'Actualiza los datos de un acompañante de una rodada' })
    @ApiBearerAuth()
    updateGuest(
        @Param('id') id: string,
        @Param('guestId') guestId: string,
        @Request() req: AuthRequest,
        @Body() dto: UpdateEventGuestDto,
        @CurrentClub() clubId?: string,
    ): Promise<GuestRow> {
        return this.eventsService.updateGuest(id, guestId, req.user.id, dto, clubId);
    }

    @Delete(':id/guests/:guestId')
    @ApiOperation({ summary: 'Eliminar acompañante', description: 'Elimina un acompañante de una rodada' })
    @ApiBearerAuth()
    removeGuest(
        @Param('id') id: string,
        @Param('guestId') guestId: string,
        @Request() req: AuthRequest,
        @CurrentClub() clubId?: string,
    ): Promise<{ deleted: boolean }> {
        return this.eventsService.removeGuest(id, guestId, req.user.id, clubId);
    }
}
