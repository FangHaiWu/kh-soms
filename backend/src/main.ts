import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common'; // Tao pipe validate
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'; // Tao tai lieu API

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1'); // Thiet lap prefix cho tat ca cac route

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  ); // Tao pipe validate, whitelist de bo qua cac field khong can thiet, transform de chuyen doi kieu du lieu

  const config = new DocumentBuilder()
    .setTitle('KH-SOMS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, config),
  ); // Tao tai lieu API
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Server: http://localhost:${process.env.PORT ?? 3000}/api/v1`);
  console.log(`Swagger: http://localhost:${process.env.PORT ?? 3000}/api/docs`);
}
bootstrap();
