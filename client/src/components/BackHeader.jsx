import { useNavigate } from 'react-router-dom';

export default function BackHeader({ title, subtitle }) {
  const navigate = useNavigate();

  return (
    <div className="page-header back-header">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}
