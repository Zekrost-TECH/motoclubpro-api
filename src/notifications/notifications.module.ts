import { Module } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { MailService } from './mail.service';

export { FcmService } from './fcm.service';
export { MailService } from './mail.service';

@Module({
    providers: [FcmService, MailService],
    exports: [FcmService, MailService],
})
export class NotificationsModule { }
