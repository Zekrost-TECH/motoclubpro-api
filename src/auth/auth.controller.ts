import {
    Controller, Post, Get, UseGuards, Request,
    Body, UnauthorizedException, HttpCode, ForbiddenException, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TurnstileService } from '../turnstile/turnstile.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SwitchClubDto } from './dto/switch-club.dto';
import type { AuthRequest, AuthResponse } from './auth.types';

interface RequestWithIp {
    ip?: string;
}

@Controller('auth')
@ApiTags('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly turnstileService: TurnstileService,
    ) { }

    // Login para la app movil (sin Turnstile)
    // Limitar los intentos de login: max 5 intentos en bloque de 1 minuto (60000ms)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('login')
    @HttpCode(200)
    @ApiOperation({ summary: 'Login app movil', description: 'Autenticacion para la app movil sin Turnstile' })
    async login(@Body() body: LoginDto): Promise<AuthResponse> {
        const user = await this.authService.validateUser(body.email, body.password);
        if (!user) throw new UnauthorizedException('Credenciales inválidas');
        return this.authService.login(user);
    }

    // Login exclusivo para el panel web (con Turnstile)
    // Limitar los intentos de login: max 5 intentos en bloque de 1 minuto (60000ms)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('login/web')
    @HttpCode(200)
    @ApiOperation({ summary: 'Login web', description: 'Autenticacion para el panel web con Turnstile' })
    async loginWeb(@Body() body: LoginDto, @Req() req: RequestWithIp): Promise<AuthResponse> {
        const turnstileValid = await this.turnstileService.verifyToken(body.turnstileToken, req.ip);
        if (!turnstileValid) {
            throw new UnauthorizedException('Verificacion de seguridad fallida. Intenta de nuevo.');
        }

        const user = await this.authService.validateUser(body.email, body.password);
        if (!user) throw new UnauthorizedException('Credenciales inválidas');
        return this.authService.login(user);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('register')
    @HttpCode(201)
    @ApiOperation({ summary: 'Registro de usuario', description: 'Crea un nuevo usuario. Turnstile opcional (app movil no lo envia)' })
    async register(@Body() body: RegisterDto, @Req() req: RequestWithIp): Promise<AuthResponse> {
        // Turnstile es opcional (la app móvil no lo envía); si viene, se valida.
        // La landing (self-service) siempre lo envía → protege contra bots.
        if (body.turnstileToken) {
            const turnstileValid = await this.turnstileService.verifyToken(body.turnstileToken, req.ip);
            if (!turnstileValid) {
                throw new UnauthorizedException('Verificacion de seguridad fallida. Intenta de nuevo.');
            }
        }
        return this.authService.register(body);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('refresh')
    @HttpCode(200)
    @ApiOperation({ summary: 'Renovar tokens', description: 'Genera nuevos access y refresh tokens' })
    async refresh(@Body() dto: RefreshDto): Promise<Pick<AuthResponse, 'access_token' | 'refresh_token'>> {
        if (!dto.refresh_token) throw new UnauthorizedException('El refresh token es obligatorio');
        return this.authService.refresh(dto.refresh_token);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Logout', description: 'Revoca el refresh token y access token' })
    async logout(@Request() req: AuthRequest & { headers: { authorization?: string } }, @Body('refresh_token') refreshToken: string): Promise<{ message: string }> {
        const authHeader = req.headers.authorization;
        const accessToken = authHeader?.split(' ')[1];

        await this.authService.logout(refreshToken, accessToken);
        return { message: 'Sesión cerrada correctamente' };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Perfil actual', description: 'Obtiene el usuario autenticado' })
    async me(@Request() req: AuthRequest): Promise<Omit<AuthResponse['user'], 'clubs'>> {
        return await this.authService.getMe(req.user.id);
    }

    @Get('clubs')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Clubs del usuario', description: 'Lista los clubs a los que pertenece el usuario' })
    async clubs(@Request() req: AuthRequest & { headers: { 'x-club-id'?: string } }): Promise<{ clubs: { club_id: string; role: string; name: string; slug: string; description: string | null; logo_url: string | null; city: string | null; department: string | null; features: Record<string, boolean> }[]; activeClubId: string | null }> {
        const activeClubId = req.headers['x-club-id'] ?? null;
        return { clubs: await this.authService.getUserClubs(req.user.id), activeClubId };
    }

    @Post('switch-club')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Cambiar club activo', description: 'Genera nuevos tokens con el club activo cambiado' })
    async switchClub(@Request() req: AuthRequest, @Body() dto: SwitchClubDto): Promise<{ access_token: string; refresh_token: string }> {
        if (!dto.club_id) throw new ForbiddenException('El campo club_id es obligatorio');
        return this.authService.switchClub(req.user.id, dto.club_id);
    }
}