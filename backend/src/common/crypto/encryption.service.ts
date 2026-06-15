import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EncryptionService {
  private encryptionKey: Buffer;
  constructor(private readonly configService: ConfigService) {
    //1a. Doc key tu env, decode tu base64 thanh Buffer
    const keyBase64 = this.configService.get('FB_CRED_ENC_KEY');
    //1b. Validate: thieu hoac do dai sai -> throw ngay
    if (!keyBase64 || Buffer.from(keyBase64, 'base64').length !== 32) {
      throw new Error(
        'FB_CRED_ENC_KEY bắt buộc và phải có 32 bytes (khi decode base64)',
      );
    }
    //1c. Lưu key vào property (đọc 1 lần, dùng nhiều lần)
    this.encryptionKey = Buffer.from(keyBase64, 'base64');
  }

  // == ENCRYPT ==
  // Đầu vào: plaintext (chuỗi mật khẩu/session)
  // Đầu ra: ciphertext (chuỗi bảo mật)
  // Mô tả:
  /* 
      Plaintext: facebook_password_123
            ↓ (mã hóa với key + IV ngẫu nhiên)
      Stored: LYHrYclLQjuUAHqY:owclwPz/DaxqmdDQwDubZA==:858I0jz4nOKypktxc4nsSBjjPWsW
                    ↑ IV (12 byte)  ↑ AuthTag (16 byte)          ↑ Ciphertext
      */
  encrypt(plaintext: string): string {
    //2a. Sinh IV ngẫu nhiên 12 bytes (chuẩn GCM)
    const iv = randomBytes(12);
    //2b. Tạo cipher object dùng GCM  / cipher = algorithm + key + iv
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    //2c. Mã hóa plaintext với cipher
    // Vi du: ciphertext = "LYHrYclLQjuUAHqY" (12 bytes) + "owclwPz/DaxqmdDQwDubZA==" (16 bytes) + "858I0jz4nOKypktxc4nsSBjjPWsW" (16 bytes) = 32 bytes
    // string in -> Buffer out
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]); // Mã hóa bytes cuối nếu có.
    //2d. Lấy authentication tag
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${ciphertext.toString('base64')}:${authTag.toString('base64')}`;
  }
  /* 
  [ Chuỗi đã mã hóa kèm IV ]
            │
            ▼
      ┌───────────┐
      │ Tách chuỗi│ ───► Lấy riêng IV ra
      └─────┬─────┘ ───► Lấy riêng Ciphertext (Bản mã) ra
            │
            ▼
┌───────────────────────┐
│ createDecipheriv()    │ ◄─── Nạp (Algorithm, Key, IV vừa tách)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ decipher.update()     │ ◄─── Giải mã các khối 16-bytes đầu tiên
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ decipher.final()      │ ◄─── Giải mã khối cuối cùng
└───────────┬───────────┘      Tự động gỡ bỏ phần Padding dư thừa
            │
            ▼
      [ Dữ liệu gốc ]
   */
  decrypt(encryptedText: string): string {
    try {
      //3a. Tách chuỗi
      const [iv_b64, cipher_b64, auth_b64] = encryptedText.split(':');
      const iv = Buffer.from(iv_b64, 'base64');
      const cipher = Buffer.from(cipher_b64, 'base64');
      const authTag = Buffer.from(auth_b64, 'base64');

      //3b. Tao decipher object dùng GCM
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      //3c. Giải mật
      //3c1. Nạp tem niêm phong vào để đối chiếu (Phải gọi trước khi gọi decipher.final)
      decipher.setAuthTag(authTag);
      //3c2. Giải mật
      const plaintext = decipher.update(cipher);
      //3c3. Giải mật khối cuối cùng
      decipher.final();
      return plaintext.toString('utf-8');
    } catch (error) {
      // Bọc catch đề phòng trường hợp chuỗi bị hack, nhập thiếu ký tự làm crash ứng dụng
      throw new BadRequestException(
        `Giải mã thất bại: Dữ liệu sai hoặc đã bị chỉnh sửa. Chi tiết: ${error}`,
      );
    }
  }
}
