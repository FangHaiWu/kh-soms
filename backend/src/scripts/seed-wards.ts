/**
 * Sinh gazetteer từ khanh-hoa-wards.ts → spatial.wards + spatial.ward_aliases.
 * Idempotent: xóa alias cũ của ward rồi ghi lại; ward khớp theo `name`.
 *
 * Chạy: npx ts-node -r tsconfig-paths/register src/scripts/seed-wards.ts
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { Ward } from '../modules/geography/entities/ward.entity';
import { WardAlias } from '../modules/geography/entities/ward-alias.entity';
import { WARDS } from '../modules/geography/data/khanh-hoa-wards';
import { normalizeAlias } from '../modules/geography/services/ward-matcher';

// Bỏ tiền tố loại để lấy tên gọi thường ngày: "Phường Nha Trang" → "Nha Trang"
function stripPrefix(name: string): string {
  return name.replace(/^(Phường|Xã|Đặc khu|Thị trấn)\s+/i, '');
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const wardRepo: Repository<Ward> = app.get(getRepositoryToken(Ward));
  const aliasRepo: Repository<WardAlias> = app.get(getRepositoryToken(WardAlias));

  let nWard = 0;
  let nAlias = 0;
  for (const seed of WARDS) {
    let ward = await wardRepo.findOne({ where: { name: seed.name } });
    if (!ward) {
      ward = wardRepo.create({ name: seed.name });
      nWard++;
    }
    ward.shortName = stripPrefix(seed.name);
    ward.wardType = seed.type;
    ward.region = seed.region;
    await wardRepo.save(ward);

    // Ghi lại toàn bộ alias của ward này để script chạy lại không nhân đôi
    await aliasRepo.delete({ wardId: ward.id });

    const rows: Partial<WardAlias>[] = [];
    // Alias official: cả tên đầy đủ lẫn tên rút gọn
    for (const a of [seed.name, ward.shortName]) {
      rows.push({
        wardId: ward.id,
        alias: a,
        aliasNorm: normalizeAlias(a),
        aliasType: 'official',
        requiresCue: seed.requiresCue ?? false,
      });
    }
    // Alias tên cũ: luôn requires_cue — tên cũ mơ hồ hơn tên hiện hành
    for (const old of seed.oldNames) {
      rows.push({
        wardId: ward.id,
        alias: old,
        aliasNorm: normalizeAlias(old),
        aliasType: 'old_ward',
        requiresCue: true,
      });
    }
    // Khử trùng trong cùng 1 ward (vd short_name trùng 1 old name) — UNIQUE(alias_norm, ward_id)
    const seen = new Set<string>();
    const deduped = rows.filter((r) =>
      seen.has(r.aliasNorm!) ? false : (seen.add(r.aliasNorm!), true),
    );
    await aliasRepo.save(deduped.map((r) => aliasRepo.create(r)));
    nAlias += deduped.length;
  }

  const total = await wardRepo.count();
  console.log(`✅ ward mới: ${nWard} | alias ghi: ${nAlias} | tổng ward: ${total}`);
  if (total !== 65) console.warn(`⚠️  Tổng ward = ${total}, kỳ vọng 65`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
