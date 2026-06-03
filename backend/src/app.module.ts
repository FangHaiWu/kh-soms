import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull'; // BullModule dung de khoi tao queue
import { ScheduleModule } from '@nestjs/schedule'; // ScheduleModule dung de khoi tao scheduler
import { OsintModule } from './modules/osint/osint.module';
@Module({
  imports: [
    // 1. Config - Phai load dau tien, isGlobal de su dung moi noi
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // 2. TypeORM - Ket noi PostgreSQL
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get('DB_PORT'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false, // Chi dung cho dev, san xuat phai dung migration
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    // 3. Bull - queue crawl job, dung Redis
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
        },
      }),
    }),

    // 4. Schedule -cho cron job tu dong crawl
    ScheduleModule.forRoot(),

    OsintModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
