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
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateAttendeeRoleDto } from './dto/update-attendee-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventCaptainGuard } from './guards/event-captain.guard';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
    constructor(private readonly eventsService: EventsService) { }

    @Get()
    findAll(
        @Query('status') status?: string,
        @Query('upcoming') upcoming?: string,
    ) {
        const isUpcoming = upcoming === 'true';
        return this.eventsService.findAll(status, isUpcoming);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.eventsService.findOne(id);
    }

    @Post()
    @Roles(UserRole.admin, UserRole.lider)
    create(@Body() createEventDto: CreateEventDto, @Request() req) {
        return this.eventsService.create(createEventDto, req.user.id);
    }

    @Patch(':id')
    @UseGuards(EventCaptainGuard)
    update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto) {
        return this.eventsService.update(id, updateEventDto);
    }

    @Patch(':id/status')
    @Roles(UserRole.admin, UserRole.lider) // Or @UseGuards(EventCaptainGuard) depending on access needs
    updateStatus(@Param('id') id: string, @Body() updateEventStatusDto: UpdateEventStatusDto) {
        return this.eventsService.updateStatus(id, updateEventStatusDto.status);
    }

    @Delete(':id')
    @Roles(UserRole.admin) // Only admin can delete per docs
    remove(@Param('id') id: string) {
        return this.eventsService.remove(id);
    }

    // --- RSVP ---
    @Post(':id/rsvp')
    rsvp(@Param('id') id: string, @Request() req, @Body('rideRole') rideRole?: string) {
        return this.eventsService.rsvp(id, req.user, rideRole);
    }

    @Delete(':id/rsvp')
    cancelRsvp(@Param('id') id: string, @Request() req) {
        return this.eventsService.cancelRsvp(id, req.user.id);
    }

    @Get(':id/attendees')
    getAttendees(@Param('id') id: string) {
        return this.eventsService.getAttendees(id);
    }

    @Patch(':id/attendees/:userId')
    @UseGuards(EventCaptainGuard)
    updateAttendeeRole(
        @Param('id') id: string,
        @Param('userId') userId: string,
        @Body() updateAttendeeRoleDto: UpdateAttendeeRoleDto,
    ) {
        return this.eventsService.updateAttendeeRole(
            id,
            userId,
            updateAttendeeRoleDto.ride_role,
        );
    }

    // --- CHECKLIST ---
    @Get(':id/checklist')
    getChecklist(@Param('id') id: string) {
        return this.eventsService.getChecklist(id);
    }

    @Post(':id/checklist/respond')
    respondChecklist(
        @Param('id') id: string,
        @Request() req,
        @Body() responses: { itemId: string; checked: boolean }[],
    ) {
        return this.eventsService.respondChecklist(id, req.user.id, responses);
    }

    @Get(':id/checklist/status')
    @UseGuards(EventCaptainGuard)
    getChecklistStatus(@Param('id') id: string) {
        return this.eventsService.getChecklistStatus(id);
    }

    // --- INVENTORY ---
    @Get(':id/inventory')
    getInventory(@Param('id') id: string) {
        return this.eventsService.getInventory(id);
    }

    @Post(':id/inventory')
    @Roles(UserRole.admin, UserRole.lider) // or EventCaptainGuard, docs say captain/admin
    addInventoryItem(@Param('id') id: string, @Body() createInventoryItemDto: CreateInventoryItemDto) {
        return this.eventsService.addInventoryItem(id, createInventoryItemDto);
    }

    @Patch(':id/inventory/:itemId/claim')
    claimInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req) {
        return this.eventsService.claimInventoryItem(id, itemId, req.user.id);
    }

    @Delete(':id/inventory/:itemId/claim')
    releaseInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req) {
        return this.eventsService.releaseInventoryItem(id, itemId, req.user.id);
    }

    @Delete(':id/inventory/:itemId')
    @Roles(UserRole.admin, UserRole.lider)
    removeInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string) {
        return this.eventsService.removeInventoryItem(id, itemId);
    }
}
