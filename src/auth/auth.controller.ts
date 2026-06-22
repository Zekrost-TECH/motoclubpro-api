import {
    Controller, Post, Get, UseGuards, Request,
    Body, UnauthorizedException, HttpCode, ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthRequest, AuthResponse } from './auth.types';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    // Limitar los intentos de login: max 5 intentos en bloque de 1 minuto (60000ms)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('login')
    @HttpCode(200)
    async login(@Body() body: LoginDto): Promise<AuthResponse> {
        const user = await this.authService.validateUser(body.email, body.password);
        if (!user) throw new UnauthorizedException('Invalid credentials');
        return this.authService.login(user);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('register')
    @HttpCode(201)
    async register(@Body() body: RegisterDto): Promise<AuthResponse> {
        return this.authService.register(body);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('refresh')
    @HttpCode(200)
    async refresh(@Body('refresh_token') refreshToken: string): Promise<Pick<AuthResponse, 'access_token' | 'refresh_token'>> {
        if (!refreshToken) throw new UnauthorizedException('Refresh token is missing');
        return this.authService.refresh(refreshToken);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    async logout(@Request() req: AuthRequest & { headers: { authorization?: string } }, @Body('refresh_token') refreshToken: string): Promise<{ message: string }> {
        const authHeader = req.headers.authorization;
        const accessToken = authHeader?.split(' ')[1];

        await this.authService.logout(refreshToken, accessToken);
        return { message: 'Logged out successfully' };
    }

    @Get('clubs')
    @UseGuards(JwtAuthGuard)
    async clubs(@Request() req: AuthRequest): Promise<{ club_id: string; role: string; name: string; slug: string; logo_url: string | null; city: string | null; department: string | null }[]> {
        return this.authService.getUserClubs(req.user.id);
    }

    @Post('switch-club')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    async switchClub(@Request() req: AuthRequest, @Body('club_id') clubId: string): Promise<{ access_token: string; refresh_token: string }> {
        if (!clubId) throw new ForbiddenException('club_id is required');
        return this.authService.switchClub(req.user.id, clubId);
    }
}