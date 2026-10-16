import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TrackerController } from './tracker.controller';
import { TrackerService } from './tracker.service';
import { TrackerJwtStrategy } from '../auth/strategies/tracker-jwt.strategy';

@Module({
    // JwtModule vacío: el token de tracking se firma con secret explícito en
    // cada sign() (TRACKER_JWT_SECRET), no con el del access token global.
    imports: [JwtModule.register({}), PassportModule],
    controllers: [TrackerController],
    providers: [TrackerService, TrackerJwtStrategy],
})
export class TrackerModule { }
