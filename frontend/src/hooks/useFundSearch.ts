import { useDeferredValue, useMemo, useState } from 'react';
import { FundSummary } from '../types';

interface UseFundSearchOptions {
  funds: FundSummary[];
  initialResults?: number;
  searchResults?: number;
}

const TURKISH_CHAR_MAP: Record<string, string> = {
  c: 'c',
  ç: 'c',
  g: 'g',
  ğ: 'g',
  i: 'i',
  ı: 'i',
  o: 'o',
  ö: 'o',
  s: 's',
  ş: 's',
  u: 'u',
  ü: 'u',
};

const normalizeSearchText = (value: string) =>
  value
    .toLocaleLowerCase('tr-TR')
    .replace(/[cçgğiıoösşuü]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const useFundSearch = ({
  funds,
  initialResults = 8,
  searchResults = 100,
}: UseFundSearchOptions) => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const matches = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredQuery);
    if (!normalizedQuery) {
      return funds.slice(0, initialResults);
    }

    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

    return funds
      .map((fund) => {
        const normalizedCode = normalizeSearchText(fund.code);
        const normalizedTitle = normalizeSearchText(fund.title);
        const searchableText = `${normalizedCode} ${normalizedTitle}`;

        if (!queryTokens.every((token) => searchableText.includes(token))) {
          return null;
        }

        let score = 0;

        if (normalizedCode === normalizedQuery) score += 1000;
        else if (normalizedCode.startsWith(normalizedQuery)) score += 700;

        if (normalizedTitle === normalizedQuery) score += 500;
        else if (normalizedTitle.startsWith(normalizedQuery)) score += 350;

        if (searchableText.includes(normalizedQuery)) score += 150;

        score += queryTokens.reduce((total, token) => {
          if (normalizedCode.startsWith(token)) return total + 40;
          if (normalizedTitle.startsWith(token)) return total + 25;
          return total + 10;
        }, 0);

        return { fund, score };
      })
      .filter((entry): entry is { fund: FundSummary; score: number } => entry !== null)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.fund.code.localeCompare(right.fund.code, 'tr');
      })
      .slice(0, searchResults)
      .map(({ fund }) => fund);
  }, [deferredQuery, funds, initialResults, searchResults]);

  return { query, setQuery, matches };
};
