import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, Area, ComposedChart } from 'recharts';
import { formatTry6 } from '../utils/format';

interface Props {
  data: any[];
  metricLabel: string;
  selectedCodes: string[];
  isNormalized?: boolean;
  showMA?: boolean;
}

const colors = ['#2563eb', '#c9463d', '#16a34a', '#d97706', '#9333ea'];
const maColors = {
  MA50: '#f97316',
  MA200: '#22c55e',
};

const CustomTooltip = ({ active, payload, label, isNormalized }: any) => {
  if (!active || !payload || !payload.length) return null;
  
  return (
    <div style={{
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '12px',
      padding: '12px 16px',
      boxShadow: 'var(--shadow-lg)',
    }}>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
        marginBottom: '8px',
        fontWeight: 600,
      }}>
        {label}
      </p>
      {payload.map((entry: any, index: number) => {
        if (entry.dataKey?.includes('_MA')) return null;
        const value = entry.value;
        const displayValue = isNormalized 
          ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
          : formatTry6(value);
        
        return (
          <div key={index} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: entry.color,
            }} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}>
              {entry.name}: {displayValue}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const PerformanceChart = ({ data, metricLabel, selectedCodes, isNormalized, showMA }: Props) => {
  const formatYAxis = (value: number) => {
    if (isNormalized) return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    if (value < 1) return formatTry6(value);
    return formatTry6(value);
  };

  return (
    <div className="card" style={{ marginTop: 24, animation: 'scaleIn 0.4s ease-out' }}>
      <div className="section-title" style={{ marginBottom: 16 }}>
        {metricLabel} Performance {isNormalized ? '(Relative Change %)' : ''}
      </div>
      <div className="chart-wrapper" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={data} 
            margin={{ top: 12, right: 12, left: 12, bottom: 0 }}
          >
            <defs>
              {selectedCodes.map((code, index) => (
                <linearGradient key={code} id={`gradient-${code}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[index % colors.length]} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={colors[index % colors.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="var(--color-border)" 
              vertical={false}
            />
            <XAxis
              dataKey="date"
              minTickGap={40}
              tickMargin={12}
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip isNormalized={isNormalized} />} />
            <Legend 
              wrapperStyle={{
                paddingTop: '16px',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
              }}
            />
            {selectedCodes.map((code, index) => (
              <Area
                key={`area-${code}`}
                type="monotone"
                dataKey={code}
                stroke="transparent"
                fill={`url(#gradient-${code})`}
                animationDuration={1000}
                animationEasing="ease-out"
              />
            ))}
            {selectedCodes.map((code, index) => (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                name={code}
                stroke={colors[index % colors.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 6, fill: colors[index % colors.length], stroke: 'var(--color-bg-card)', strokeWidth: 2 }}
                animationDuration={1000}
                animationEasing="ease-out"
              />
            ))}
            {showMA && selectedCodes.map((code, index) => (
              <Line
                key={`${code}_MA50`}
                type="monotone"
                dataKey={`${code}_MA50`}
                name={`${code} MA50`}
                stroke={maColors.MA50}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                connectNulls
                animationDuration={1200}
              />
            ))}
            {showMA && selectedCodes.map((code, index) => (
              <Line
                key={`${code}_MA200`}
                type="monotone"
                dataKey={`${code}_MA200`}
                name={`${code} MA200`}
                stroke={maColors.MA200}
                strokeWidth={1.5}
                strokeDasharray="8 4"
                dot={false}
                connectNulls
                animationDuration={1200}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PerformanceChart;