import {
    Controller, Post, UseGuards, Request,
    Body, UnauthorizedException, HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    // Limitar los intentos de login: max 5 intentos en bloque de 1 minuto (60000ms)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('login')
    @HttpCode(200)
    async login(@Body() body: LoginDto) {
        const user = await this.authService.validateUser(body.email, body.password);
        if (!user) throw new UnauthorizedException('Invalid credentials');
        return this.authService.login(user);
    }

    @Post('register')
    @HttpCode(201)
    async register(@Body() body: RegisterDto) {
        return this.authService.register(body);
    }

    @Post('refresh')
    @HttpCode(200)
    async refresh(@Body('refresh_token') refreshToken: string) {
        if (!refreshToken) throw new UnauthorizedException('Refresh token is missing');
        return this.authService.refresh(refreshToken);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    async logout(@Request() req, @Body('refresh_token') refreshToken: string) {
        const authHeader = req.headers.authorization;
        const accessToken = authHeader?.split(' ')[1];

        await this.authService.logout(refreshToken, accessToken);
        return { message: 'Logged out successfully' };
    }
}