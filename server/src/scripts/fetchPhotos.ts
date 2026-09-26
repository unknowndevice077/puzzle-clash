/**
 * Downloads the curated photo set in photos/sources.json (Unsplash photos via the Lorem Picsum mirror,
 * no API key needed), normalises them to 1024x768 JPEGs without metadata, and writes photos.json.
 * Already-downloaded files are skipped. Usage: npm run photos:fetch
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { config } from '../config';
import type { ManifestPhoto } from '../photos';

const Source = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  file: z.string(),
  source: z.object({
    sourceUrl: z.string().url().nullable(),
    author: z.string().nullable(),
    license: z.string(),
    licenseUrl: z.string().url().nullable(),
    downloadUrl: z.string().url(),
  }),
});

async function exists(f: string): Promise<boolean> {
  try {
    await fs.access(f);
    return true;
  } catch {
    return false;
  }
}

async function download(s: z.infer<typeof Source>): Promise<boolean> {
  const target = path.join(config.photosDir, s.file);
  if (await exists(target)) return true;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(s.source.downloadUrl, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const img = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(1024, 768, { fit: 'cover' }).jpeg({ quality: 86 }).toBuffer();
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, img);
      return true;
    } catch (err) {
      if (attempt === 3) console.warn(`  failed ${s.id}: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  return false;
}

async function main(): Promise<void> {
  const sources = z.array(Source).parse(JSON.parse(await fs.readFile(path.join(config.photosDir, 'sources.json'), 'utf8')));
  console.log(`Checking ${sources.length} photos in ${config.photosDir} ...`);
  const ok: z.infer<typeof Source>[] = [];
  const queue = [...sources];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) if (await download(s)) ok.push(s);
    }),
  );
  ok.sort((a, b) => a.id.localeCompare(b.id));
  const photos: ManifestPhoto[] = ok.map((s) => ({
    id: s.id,
    pack: 'photos',
    title: s.title,
    category: s.category,
    file: s.file,
    author: s.source.author,
    sourceUrl: s.source.sourceUrl,
    license: s.source.license,
    licenseUrl: s.source.licenseUrl,
  }));
  // Studio Ghibli pack (built by `npm run photos:ghibli`).
  try {
    const ghibli = JSON.parse(await fs.readFile(path.join(config.photosDir, 'ghibli.json'), 'utf8')) as Array<{ id: string; film: string; title: string; file: string; sourceUrl: string }>;
    for (const g of ghibli) {
      if (!(await exists(path.join(config.photosDir, g.file)))) continue;
      photos.push({
        id: g.id,
        pack: 'ghibli',
        title: g.title,
        category: g.film,
        file: g.file,
        author: 'Studio Ghibli',
        sourceUrl: g.sourceUrl,
        license: 'Studio Ghibli free-use stills',
        licenseUrl: 'https://www.ghibli.jp/info/013344/',
      });
    }
  } catch {
    console.log('(no ghibli.json; run `npm run photos:ghibli` to add the Studio Ghibli pack)');
  }
  await fs.writeFile(path.join(config.photosDir, 'photos.json'), JSON.stringify({ generatedAt: new Date().toISOString(), photos }, null, 2));
  console.log(`photos.json lists ${photos.length} pictures (${photos.filter((p) => p.pack === 'ghibli').length} Studio Ghibli)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
