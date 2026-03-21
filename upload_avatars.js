import { put } from '@vercel/blob';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const IMAGES_DIR = './resources/images';
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);

async function main() {
  const files = fs.readdirSync(IMAGES_DIR).filter(f =>
    IMAGE_EXTS.has(path.extname(f).toLowerCase())
  );

  console.log(`Found ${files.length} images. Uploading...\n`);

  for (const file of files) {
    const buf = fs.readFileSync(path.join(IMAGES_DIR, file));
    const compressed = await sharp(buf)
      .rotate()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 6, alphaQuality: 80 })
      .toBuffer();

    const baseName = path.basename(file, path.extname(file)).toLowerCase();
    const blob = await put(`avatars/${baseName}.webp`, compressed, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    console.log(`${file} → ${blob.url}`);
  }

  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });