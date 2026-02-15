import { useState, useRef, useEffect } from 'react';
import { FundSummary } from '../types';
import { useFundSearch } from '../hooks/useFundSearch';

interface Props {
  funds: FundSummary[];
  selectedCodes: string[];
  onSelect: (fund: FundSummary) => void;
  loading?: boolean;
}

const FundSelector = ({ funds, selectedCodes, onSelect, loading }: Props) => {
  const { matches, query, setQuery } = useFundSearch({ funds });
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const isLimitReached = selectedCodes.length >= 5;

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < matches.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < matches.length) {
          const fund = matches[activeIndex];
          const isSelected = selectedCodes.includes(fund.code);
          if (!isSelected && isLimitReached) return;
          onSelect(fund);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeItem = listRef.current.children[activeIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  return (
    <div className="card">
      <h2 className="section-title">Search & Select Funds</h2>
      <div className="selector-dropdown">
        <input
          className="input"
          placeholder={loading ? 'Loading funds...' : 'Search fund codes...'}
          value={query}
          disabled={loading}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="fund-listbox"
          aria-activedescendant={activeIndex >= 0 ? `fund-option-${matches[activeIndex]?.code}` : undefined}
          aria-label="Search funds"
        />
        {isOpen && !loading && (
          <ul
            className="checklist-dropdown"
            role="listbox"
            id="fund-listbox"
            ref={listRef}
          >
            {matches.map((fund, index) => {
              const isSelected = selectedCodes.includes(fund.code);
              const isActive = index === activeIndex;

              return (
                <li
                  key={fund.code}
                  id={`fund-option-${fund.code}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`checklist-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Keep focus on input
                    if (!isSelected && isLimitReached) return;
                    onSelect(fund);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="checklist-checkbox"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <span className="checklist-code">{fund.code}</span>
                  <span className="sr-only">{isSelected ? 'Selected' : 'Not selected'}</span>
                </li>
              );
            })}
            {!matches.length && (
              <li className="no-matches" role="status">No matches found</li>
            )}
          </ul>
        )}
        {isLimitReached && (
          <div
            role="alert"
            className="alert-message"
          >
            <span aria-hidden="true">⚠️</span>
            Maximum of 5 funds can be selected.
          </div>
        )}
      </div>
    </div>
  );
};

export default FundSelector;
