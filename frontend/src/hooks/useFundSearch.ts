import { useMemo, useState } from 'react';
import { FundSummary } from '../types';

interface UseFundSearchOptions {
  funds: FundSummary[];
  maxResults?: number;
}

export const useFundSearch = ({ funds, maxResults = 8 }: UseFundSearchOptions) => {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return funds.slice(0, maxResults);
    }

    return funds
      .filter((fund) => fund.code.toLowerCase().includes(trimmed) || fund.title.toLowerCase().includes(trimmed))
      .slice(0, maxResults);
  }, [funds, maxResults, query]);

  return { query, setQuery, matches };
};
