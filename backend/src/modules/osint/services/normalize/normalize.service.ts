import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
@Injectable()
export class NormalizeService {
  //Flow: NFC -> bóc HTML -> gom whitespace -> tách 2 mục đích (giữ case để hiển thị, lowercase để hash)

  normalize(raw: string): { normalizedContent: string; contentHash: string } {
    const nfc = raw.normalize('NFC');
    const text = cheerio.load(nfc).text();
    const collapsed = text.replace(/[\s\u00a0]+/g, ' ').trim();

    const normalizedContent = collapsed; // giữ nguyên hoa/thường để hiển thị
    const forHash = collapsed.toLowerCase(); // lowercase để "Ma Túy" = "ma túy" khi gom cụm
    const contentHash = createHash('sha256').update(forHash).digest('hex');
    return { normalizedContent: normalizedContent, contentHash: contentHash };
  }
}
