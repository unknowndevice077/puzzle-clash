import type { BestTimeEntry, Difficulty, PlayerProfile } from '@pc/shared';

/** `?profile=name` gives a tab its own identity, so two players can test in one browser. */
const profileParam = new URLSearchParams(window.location.search).get('profile');
const TOKEN_KEY = profileParam ? `pc.token.${profileParam}` : 'pc.token';

export function savedToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Not JSON.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  /** Restores the guest from localStorage, or creates one. Optionally renames. */
  async session(name?: string): Promise<{ token: string; profile: PlayerProfile }> {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: savedToken() ?? undefined, name }),
    });
    const data = await json<{ token: string; profile: PlayerProfile }>(res);
    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },

  async best(difficulty: Difficulty): Promise<BestTimeEntry[]> {
    return (await json<{ entries: BestTimeEntry[] }>(await fetch(`/api/best/${difficulty}`))).entries;
  },

  async network(): Promise<string[]> {
    return (await json<{ urls: string[] }>(await fetch('/api/network'))).urls;
  },

  async picture(url: string): Promise<string> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load the picture');
    return URL.createObjectURL(await res.blob());
  },

  async uploadPicture(code: string, file: File): Promise<number> {
    const res = await fetch(`/api/rooms/${code}/pictures`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-player-token': savedToken() ?? '',
        'x-picture-title': encodeURIComponent(file.name.replace(/\.[^.]+$/, '').slice(0, 40)),
      },
      body: file,
    });
    return (await json<{ count: number }>(res)).count;
  },
};
