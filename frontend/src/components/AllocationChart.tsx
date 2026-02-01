import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { AllocationSlice } from '../types';

interface Props {
  data: AllocationSlice[];
}

const COLORS = ['#2563eb', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

const AllocationChart = ({ data }: Props) => (
  <div className="card">
    <div className="section-title" style={{ marginBottom: 8 }}>
      Allocation breakdown
    </div>
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={70} outerRadius={110} paddingAngle={3}>
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
          <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    </div>
    <div className="metric-label" style={{ marginTop: 10 }}>Composition by asset class</div>
  </div>
);

export default AllocationChart;
