import { Theme } from './types';
import { debug } from './utils';

export interface CommunityTheme extends Theme {
  author: string;
}

// ======================================================================

const GITHUB_RAW_BASE =
  'https://raw.githubusercontent.com/Piebald-AI/claude-code-themes/main';

const INDEX_URL = `${GITHUB_RAW_BASE}/index.json`;

// ======================================================================

export interface CommunityThemeIndexEntry {
  name: string;
  id: string;
  author: string;
}

// ======================================================================

export async function fetchCommunityThemeIndex(): Promise<
  CommunityThemeIndexEntry[]
> {
  debug(`Fetching community theme index from ${INDEX_URL}`);
  const response = await fetch(INDEX_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch community theme index: ${response.status} ${response.statusText}`
    );
  }
  return (await response.json()) as CommunityThemeIndexEntry[];
}

export async function fetchCommunityTheme(id: string): Promise<CommunityTheme> {
  const url = `${GITHUB_RAW_BASE}/themes/${id}.json`;
  debug(`Fetching community theme from ${url}`);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch community theme "${id}": ${response.status} ${response.statusText}`
    );
  }
  return (await response.json()) as CommunityTheme;
}
