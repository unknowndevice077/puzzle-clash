import { DIFFICULTIES, DIFFICULTY_SPECS, PACK_LABELS, type Difficulty, type PicturePack } from '@pc/shared';
import { CutGlyph } from './jigsaw';
import { Icon } from './ui';

/** Difficulty as three little puzzles: the icon is the actual number of pieces you'll get. */
export function DifficultyPicker({ value, onChange, disabled = false }: { value: Difficulty; onChange: (d: Difficulty) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
      {DIFFICULTIES.map((d) => {
        const spec = DIFFICULTY_SPECS[d];
        const on = d === value;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(d)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border-[1.5px] p-2 pb-2.5 transition disabled:cursor-default ${
              on ? 'border-ink bg-paper shadow-lift' : 'border-ink/15 bg-table/60 hover:border-ink/40'
            }`}
          >
            <CutGlyph cols={spec.cols} rows={spec.rows} active={on} className="aspect-[4/3] w-full max-w-[92px]" />
            <span className="font-display text-sm font-bold leading-none">{spec.label}</span>
            <span className="text-[11px] font-semibold leading-none text-muted">
              {spec.cols * spec.rows} pcs · {spec.timeLimitMs / 60_000} min
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PACK_NOTES: Record<PicturePack, string> = {
  ghibli: '300 film stills',
  photos: '263 photos',
  custom: 'Upload your own',
};

/** Picture packs shown as mini box covers. */
export function PackPicker({
  value,
  onChange,
  packs,
  disabled = false,
}: {
  value: PicturePack;
  onChange: (p: PicturePack) => void;
  packs: readonly PicturePack[];
  disabled?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${packs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label="Pictures">
      {packs.map((p) => {
        const on = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(p)}
            className={`group overflow-hidden rounded-xl border-[1.5px] text-left transition disabled:cursor-default ${
              on ? 'border-ink bg-paper shadow-lift' : 'border-ink/15 bg-table/60 hover:border-ink/40'
            }`}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-kraft-dark">
              {p === 'custom' ? (
                <div className="grid h-full place-items-center border-b border-dashed border-ink/30 text-ink/60">
                  <Icon name="upload" size={26} />
                </div>
              ) : (
                <img src={`/api/cover/${p}`} alt="" loading="lazy" className={`h-full w-full object-cover transition duration-300 ${on ? '' : 'saturate-[0.6] group-hover:saturate-100'}`} />
              )}
              {on && (
                <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border-[1.5px] border-ink bg-mustard text-ink">
                  <Icon name="check" size={14} />
                </span>
              )}
            </div>
            <div className="px-2 py-1.5">
              <div className="truncate font-display text-[13px] font-bold leading-tight">{PACK_LABELS[p]}</div>
              <div className="truncate text-[11px] text-muted">{PACK_NOTES[p]}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
