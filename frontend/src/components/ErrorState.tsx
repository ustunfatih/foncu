interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

const ErrorState = ({ 
  title = 'Something went wrong', 
  description = 'Please try again later.',
  onRetry 
}: ErrorStateProps) => {
  return (
    <div className="error-state animate-fade-in">
      <div className="error-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      </div>
      <h3 className="error-state-title">{title}</h3>
      {description && (
        <p className="error-state-description">{description}</p>
      )}
      {onRetry && (
        <button className="error-state-action" onClick={onRetry}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Try Again
        </button>
      )}
    </div>
  );
};

export default ErrorState;