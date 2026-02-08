process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // ช่วยเรื่อง SSL Error บางกรณี
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 1. ตั้งค่าโฟลเดอร์สำหรับไฟล์ Static (เช่น CSS, รูปภาพ)
  app.useStaticAssets(join(process.cwd(), 'public'));
  // 2. ตั้งค่าโฟลเดอร์สำหรับหน้า Views (EJS)
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');

  await app.listen(3080);
  console.log('🚀 Server is running at http://localhost:3080');
}
bootstrap();