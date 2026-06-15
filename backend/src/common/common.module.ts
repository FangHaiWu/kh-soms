import { Module } from '@nestjs/common';
import { EncryptionService } from '@common/crypto/encryption.service';

@Module({
  providers: [EncryptionService], // khai báo service trong module
  exports: [EncryptionService], // export service nay cho module khac
})
export class CommonModule {}
