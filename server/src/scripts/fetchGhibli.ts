/**
 * Downloads Studio Ghibli's officially released scene stills (https://www.ghibli.jp/info/013344/ —
 * "please use them freely within the bounds of common sense"), keeps the most colourful ones per film
 * (dark or flat frames make poor jigsaws), normalises them to 1024x768 and writes photos/ghibli.json.
 * Afterwards run `npm run photos:fetch` (or this script does it) to rebuild photos.json.
 * Usage: npm run photos:ghibli
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config';

export interface GhibliSource {
  id: string;
  film: string;
  title: string;
  file: string;
  sourceUrl: string;
}

// Gallery slug -> English title. Each gallery holds ~50 numbered stills.
const FILMS: Array<[string, string]> = [
  ['totoro', 'My Neighbor Totoro'],
  ['chihiro', 'Spirited Away'],
  ['howl', "Howl's Moving Castle"],
  ['majo', "Kiki's Delivery Service"],
  ['ponyo', 'Ponyo'],
  ['mononoke', 'Princess Mononoke'],
  ['laputa', 'Castle in the Sky'],
  ['nausicaa', 'Nausicaä of the Valley of the Wind'],
  ['porco', 'Porco Rosso'],
  ['karigurashi', 'Arrietty'],
  ['marnie', 'When Marnie Was There'],
  ['kazetachinu', 'The Wind Rises'],
];

const PER_FILM = 25;
const STILLS_PER_GALLERY = 50;

/** Higher is better for a jigsaw: bright enough, lots of colour and detail. */
async function puzzleScore(img: Buffer): Promise<number> {
  const s = await sharp(img).resize(64, 48, { fit: 'fill' }).stats();
  const [r, g, b] = s.channels;
  const brightness = (r.mean + g.mean + b.mean) / 3;
  const detail = (r.stdev + g.stdev + b.stdev) / 3;
  const colourfulness = Math.abs(r.mean - g.mean) + Math.abs(g.mean - b.mean) + Math.abs(b.mean - r.mean);
  const tooDark = brightness < 55 ? (55 - brightness) * 3 : 0;
  return detail + colourfulness * 0.6 - tooDark;
}

async function fetchStill(url: string): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'PuzzleClash/1.0 (photo pack builder)' }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch {
      await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }
  return null;
}

async function main(): Promise<void> {
  const out: GhibliSource[] = [];
  for (const [slug, film] of FILMS) {
    const candidates: Array<{ n: number; img: Buffer; score: number }> = [];
    const nums = Array.from({ length: STILLS_PER_GALLERY }, (_, i) => i + 1);
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let n = nums.shift(); n !== undefined; n = nums.shift()) {
          const img = await fetchStill(`https://www.ghibli.jp/gallery/${slug}${String(n).padStart(3, '0')}.jpg`);
          if (img) candidates.push({ n, img, score: await puzzleScore(img) });
        }
      }),
    );
    const best = candidates.sort((a, b) => b.score - a.score).slice(0, PER_FILM).sort((a, b) => a.n - b.n);
    const dir = path.join(config.photosDir, 'ghibli', slug);
    await fs.mkdir(dir, { recursive: true });
    for (const c of best) {
      const name = `${slug}${String(c.n).padStart(3, '0')}.jpg`;
      await fs.writeFile(path.join(dir, name), await sharp(c.img).resize(1024, 768, { fit: 'cover' }).jpeg({ quality: 84 }).toBuffer());
      out.push({ id: `ghibli-${slug}-${c.n}`, film, title: `${film}, still ${c.n}`, file: `ghibli/${slug}/${name}`, sourceUrl: `https://www.ghibli.jp/works/${slug}/` });
    }
    console.log(`${film.padEnd(36)} kept ${best.length} of ${candidates.length}`);
  }
  await fs.writeFile(path.join(config.photosDir, 'ghibli.json'), JSON.stringify(out, null, 2));
  console.log(`ghibli.json lists ${out.length} stills. Now run: npm run photos:fetch`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
