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
import {
  buildAliasRows,
  stripPrefix,
} from '../modules/geography/data/build-ward-aliases';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const wardRepo: Repository<Ward> = app.get(getRepositoryToken(Ward));
  const aliasRepo: Repository<WardAlias> = app.get(
    getRepositoryToken(WardAlias),
  );

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

    // Logic dựng + khử trùng alias đã tách sang hàm thuần có test riêng —
    // script này chỉ còn lo phần I/O với DB (gắn wardId rồi lưu).
    const rows = buildAliasRows(seed).map((r) => ({ ...r, wardId: ward.id }));
    await aliasRepo.save(rows.map((r) => aliasRepo.create(r)));
    nAlias += rows.length;
  }

  const total = await wardRepo.count();
  console.log(
    `✅ ward mới: ${nWard} | alias ghi: ${nAlias} | tổng ward: ${total}`,
  );
  if (total !== 65) console.warn(`⚠️  Tổng ward = ${total}, kỳ vọng 65`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
