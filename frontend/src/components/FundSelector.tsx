import { useState } from 'react';
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

  const isLimitReached = selectedCodes.length >= 5;

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
          aria-label="Search funds"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={isOpen ? 'fund-listbox' : undefined}
          aria-activedescendant={matches.length > 0 ? `fund-option-${matches[0].code}` : undefined}
          role="combobox"
        />
        {isOpen && !loading && (
          <ul
            id="fund-listbox"
            className="checklist-dropdown"
            role="listbox"
            aria-label="Available funds"
          >
            {matches.map((fund) => {
              const isSelected = selectedCodes.includes(fund.code);
              return (
                <li
                  key={fund.code}
                  id={`fund-option-${fund.code}`}
                  className={`checklist-item ${isSelected ? 'selected' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Keep focus on input
                    if (!isSelected && isLimitReached) return;
                    onSelect(fund);
                  }}
                  role="option"
                  aria-selected={isSelected}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="checklist-checkbox"
                  />
                  <span className="checklist-code">{fund.code}</span>
                </li>
              );
            })}
            {!matches.length && <li className="no-matches">No matches</li>}
          </ul>
        )}
        {isLimitReached && (
          <div style={{ marginTop: 8, color: '#dc2626', fontSize: '0.85rem' }}>
            Maximum of 5 funds can be selected.
          </div>
        )}
      </div>
    </div>
  );
};

export default FundSelector;
