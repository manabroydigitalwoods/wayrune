import { Module } from '@nestjs/common';
import { MetaCloudMessagingProvider } from './meta-cloud.messaging';

@Module({
  providers: [MetaCloudMessagingProvider],
  exports: [MetaCloudMessagingProvider],
})
export class MessagingModule {}
