interface Props {
  label: string;
  value: string;
  helper?: string;
}

const MetricCard = ({ label, value, helper }: Props) => (
  <div className="card">
    <div className="metric-value">{value}</div>
    <div className="metric-label">{label}</div>
    {helper && <div style={{ marginTop: 6, color: '#0f172a' }}>{helper}</div>}
  </div>
);

export default MetricCard;
