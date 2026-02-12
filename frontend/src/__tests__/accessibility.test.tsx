import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import FundCard from '../components/FundCard';

expect.extend(toHaveNoViolations);

// Mock FundOverview data
const mockFund = {
  code: 'TEST',
  title: 'Test Fund',
  priceHistory: [
    { date: '2024-01-01', value: 10.5 },
    { date: '2024-01-02', value: 10.6 },
  ],
  investorHistory: [],
  marketCapHistory: [],
};

describe('FundCard Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(
      <FundCard
        fund={mockFund}
        onRemove={() => {}}
        color="#2563eb"
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have accessible remove button', () => {
    const { getByLabelText } = render(
      <FundCard
        fund={mockFund}
        onRemove={() => {}}
        color="#2563eb"
      />
    );

    const removeButton = getByLabelText('Remove fund TEST');
    expect(removeButton).toBeInTheDocument();
    expect(removeButton).toHaveAttribute('aria-label', 'Remove fund TEST');
  });
});
