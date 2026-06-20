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
} from '@nestjs/common';
import { UsersService } from './users.service';

import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from './users.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @Roles(UserRole.admin, UserRole.lider)
    create(@Body() createUserDto: CreateUserDto) {
        return this.usersService.createUser(createUserDto);
    }

    @Get()
    @Roles(UserRole.admin, UserRole.lider, UserRole.piloto)
    findAll() {
        return this.usersService.findAll();
    }

    @Get('me')
    getMe(@Request() req) {
        return this.usersService.findOne(req.user.id);
    }

    @Patch('me')
    updateMe(@Request() req, @Body() updateUserDto: UpdateUserDto) {
        console.log('Received updateMe request:', { userId: req.user.id, updateUserDto });
        return this.usersService.updateUser(req.user.id, updateUserDto);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        // auth guard is active, assuming users can read regular profiles
        return this.usersService.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateUserDto: UpdateUserDto,
    ) {
        // Note: should implement owner/admin check guard here to restrict updates
        return this.usersService.updateUser(id, updateUserDto);
    }

    @Get(':id/medical')
    getMedicalInfo(@Param('id') id: string) {
        // Note: should implement self/admin check guard
        return this.usersService.getMedicalInfo(id);
    }

    @Delete(':id')
    @Roles(UserRole.admin)
    remove(@Param('id') id: string) {
        return this.usersService.remove(id);
    }
}
