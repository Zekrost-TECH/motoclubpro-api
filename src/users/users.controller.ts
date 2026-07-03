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
import { UsersService } from './users.service';

import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { SelfOrAdminGuard } from '../auth/guards/self-or-admin.guard';
import { UserRole } from './users.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentClub } from '../auth/decorators/club.decorator';
import type { AuthRequest } from '../auth/auth.types';
import type { User } from './users.types';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('users')
@ApiTags('users')
@UseGuards(JwtAuthGuard, ClubGuard, RolesGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @Roles(UserRole.admin)
    create(@Body() createUserDto: CreateUserDto): Promise<User> {
        return this.usersService.createUser(createUserDto);
    }

    @Get()
    @Roles(UserRole.admin, UserRole.leader, UserRole.rider)
    findAll(@CurrentClub() clubId?: string, @Query() pagination?: PaginationDto): Promise<{ data: User[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        return this.usersService.findAll(clubId, pagination?.page, pagination?.limit);
    }

    @Get('me')
    getMe(@Request() req: AuthRequest): Promise<User & { motorcycle?: unknown; userPositions?: unknown }> {
        return this.usersService.findOne(req.user.id);
    }

    @Patch('me')
    updateMe(@Request() req: AuthRequest, @Body() updateUserDto: UpdateUserDto): Promise<User> {
        return this.usersService.updateUser(req.user.id, updateUserDto);
    }

    @Get(':id')
    @UseGuards(SelfOrAdminGuard)
    findOne(@Param('id') id: string): Promise<User & { motorcycle?: unknown; userPositions?: unknown }> {
        return this.usersService.findOne(id);
    }

    @Patch(':id')
    @UseGuards(SelfOrAdminGuard)
    update(
        @Param('id') id: string,
        @Body() updateUserDto: UpdateUserDto,
    ): Promise<User> {
        return this.usersService.updateUser(id, updateUserDto);
    }

    @Get(':id/medical')
    @UseGuards(SelfOrAdminGuard)
    getMedicalInfo(@Param('id') id: string): Promise<User> {
        return this.usersService.getMedicalInfo(id);
    }

    @Delete(':id')
    @Roles(UserRole.admin)
    remove(@Param('id') id: string): Promise<User> {
        return this.usersService.remove(id);
    }
}
