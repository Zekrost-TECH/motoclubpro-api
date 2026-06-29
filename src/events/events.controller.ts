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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventsService, type EventRow, type AttendeeRow, type InventoryRow, type ChecklistItemRow } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateAttendeeRoleDto } from './dto/update-attendee-role.dto';
import { FindEventsQueryDto } from './dto/find-events-query.dto';
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
    findAll(
        @Query('status') status?: string,
        @Query('upcoming') upcoming?: string,
        @CurrentClub() clubId?: string,
        @Query() query?: FindEventsQueryDto,
    ): Promise<{ data: EventRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        const isUpcoming = upcoming === 'true';
        return this.eventsService.findAll(status, isUpcoming, clubId, query?.page, query?.limit);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[] }> {
        return this.eventsService.findOne(id, clubId);
    }

    @Post()
    @ClubRoles(UserRole.admin, UserRole.lider)
    create(@Body() createEventDto: CreateEventDto, @Request() req: AuthRequest, @CurrentClub() clubId?: string): Promise<EventRow> {
        return this.eventsService.create(createEventDto, req.user.id, clubId);
    }

    @Patch(':id')
    @UseGuards(EventCaptainGuard)
    update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto, @CurrentClub() clubId?: string): Promise<EventRow> {
        return this.eventsService.update(id, updateEventDto, clubId);
    }

    @Patch(':id/status')
    @ClubRoles(UserRole.admin, UserRole.lider)
    updateStatus(@Param('id') id: string, @Body() updateEventStatusDto: UpdateEventStatusDto, @CurrentClub() clubId?: string): Promise<EventRow> {
        return this.eventsService.updateStatus(id, updateEventStatusDto.status, clubId);
    }

    @Delete(':id')
    @ClubRoles(UserRole.admin)
    remove(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<{ deleted: boolean }> {
        return this.eventsService.remove(id, clubId);
    }

    // --- RSVP ---
    @Post(':id/rsvp')
    rsvp(@Param('id') id: string, @Request() req: AuthRequest, @Body('rideRole') rideRole?: string, @CurrentClub() clubId?: string): Promise<{ success: boolean; message: string }> {
        return this.eventsService.rsvp(id, req.user, rideRole, clubId);
    }

    @Delete(':id/rsvp')
    cancelRsvp(@Param('id') id: string, @Request() req: AuthRequest, @CurrentClub() clubId?: string): Promise<{ deleted: boolean }> {
        return this.eventsService.cancelRsvp(id, req.user.id, clubId);
    }

    @Get(':id/attendees')
    getAttendees(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<AttendeeRow[]> {
        return this.eventsService.getAttendees(id, clubId);
    }

    @Patch(':id/attendees/:userId')
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
    getChecklist(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<ChecklistItemRow[]> {
        return this.eventsService.getChecklist(id, clubId);
    }

    @Post(':id/checklist')
    @ClubRoles(UserRole.admin, UserRole.lider)
    addChecklistItem(
        @Param('id') id: string,
        @Body() dto: CreateChecklistItemDto,
        @CurrentClub() clubId?: string,
    ): Promise<ChecklistItemRow> {
        return this.eventsService.addChecklistItem(id, dto.label, dto.required ?? false, clubId);
    }

    @Delete(':id/checklist/:itemId')
    @ClubRoles(UserRole.admin, UserRole.lider)
    removeChecklistItem(
        @Param('id') id: string,
        @Param('itemId') itemId: string,
        @CurrentClub() clubId?: string,
    ): Promise<{ deleted: boolean }> {
        return this.eventsService.removeChecklistItem(id, itemId, clubId);
    }

    @Post(':id/checklist/respond')
    respondChecklist(
        @Param('id') id: string,
        @Request() req: AuthRequest,
        @Body() responses: { itemId: string; checked: boolean }[],
        @CurrentClub() clubId?: string,
    ): Promise<{ success: boolean; checklist_completed: boolean }> {
        return this.eventsService.respondChecklist(id, req.user.id, responses, clubId);
    }

    @Get(':id/checklist/status')
    @UseGuards(EventCaptainGuard)
    getChecklistStatus(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<{ userId: string; name: string; checklist_completed: boolean }[]> {
        return this.eventsService.getChecklistStatus(id, clubId);
    }

    // --- INVENTORY ---
    @Get(':id/inventory')
    getInventory(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<InventoryRow[]> {
        return this.eventsService.getInventory(id, clubId);
    }

    @Post(':id/inventory')
    @ClubRoles(UserRole.admin, UserRole.lider)
    addInventoryItem(@Param('id') id: string, @Body() createInventoryItemDto: CreateInventoryItemDto, @CurrentClub() clubId?: string): Promise<InventoryRow> {
        return this.eventsService.addInventoryItem(id, createInventoryItemDto, clubId);
    }

    @Patch(':id/inventory/:itemId/claim')
    claimInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req: AuthRequest, @CurrentClub() clubId?: string): Promise<InventoryRow> {
        return this.eventsService.claimInventoryItem(id, itemId, req.user.id, clubId);
    }

    @Delete(':id/inventory/:itemId/claim')
    releaseInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req: AuthRequest, @CurrentClub() clubId?: string): Promise<{ released: boolean; item: InventoryRow }> {
        return this.eventsService.releaseInventoryItem(id, itemId, req.user.id, clubId);
    }

    @Delete(':id/inventory/:itemId')
    @ClubRoles(UserRole.admin, UserRole.lider)
    removeInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentClub() clubId?: string): Promise<{ deleted: boolean }> {
        return this.eventsService.removeInventoryItem(id, itemId, clubId);
    }
}
