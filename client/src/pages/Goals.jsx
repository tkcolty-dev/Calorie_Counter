import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import BackHeader from '../components/BackHeader';

export default function Goals() {
  const [dailyTotal, setDailyTotal] = useState(2000);
  const [breakfast, setBreakfast] = useState('');
  const [lunch, setLunch] = useState('');
  const [dinner, setDinner] = useState('');
  const [snacks, setSnacks] = useState('');
  const [proteinGoal, setProteinGoal] = useState('');
  const [carbsGoal, setCarbsGoal] = useState('');
  const [fatGoal, setFatGoal] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: goals, isLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then(r => r.data),
  });

  useEffect(() => {
    if (goals) {
      setDailyTotal(goals.daily_total || 2000);
      setBreakfast(goals.breakfast || '');
      setLunch(goals.lunch || '');
      setDinner(goals.dinner || '');
      setSnacks(goals.snacks || '');
      setProteinGoal(goals.protein_goal_g || '');
      setCarbsGoal(goals.carbs_goal_g || '');
      setFatGoal(goals.fat_goal_g || '');
      setTargetWeight(goals.target_weight_lbs || '');
    }
  }, [goals]);

  const updateGoals = useMutation({
    mutationFn: (data) => api.put('/goals', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setSuccess('Goals updated!');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => {
      setError(err.response?.data?.error || 'Failed to update goals');
      setSuccess('');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateGoals.mutate({
      daily_total: parseInt(dailyTotal),
      breakfast: breakfast ? parseInt(breakfast) : null,
      lunch: lunch ? parseInt(lunch) : null,
      dinner: dinner ? parseInt(dinner) : null,
      snacks: snacks ? parseInt(snacks) : null,
      protein_goal_g: proteinGoal ? parseFloat(proteinGoal) : null,
      carbs_goal_g: carbsGoal ? parseFloat(carbsGoal) : null,
      fat_goal_g: fatGoal ? parseFloat(fatGoal) : null,
      target_weight_lbs: targetWeight ? parseFloat(targetWeight) : null,
    });
  };

  if (isLoading) return <div className="loading">Loading goals...</div>;

  const mealTotal = (parseInt(breakfast) || 0) + (parseInt(lunch) || 0) + (parseInt(dinner) || 0) + (parseInt(snacks) || 0);

  return (
    <div>
      <BackHeader title="Calorie Goals" subtitle="Set your daily calorie targets" />

      <form onSubmit={handleSubmit} className="card">
        {error && <div className="error-message">{error}</div>}
        {success && (
          <div style={{
            background: 'color-mix(in srgb, var(--color-success) 10%, var(--color-surface))', color: 'var(--color-success)', padding: '0.75rem 1rem',
            borderRadius: 'var(--radius)', fontSize: '0.875rem', marginBottom: '1rem',
            border: '1px solid color-mix(in srgb, var(--color-success) 30%, transparent)',
          }}>
            {success}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="dailyTotal">Daily calorie goal</label>
          <input
            id="dailyTotal"
            type="number"
            value={dailyTotal}
            onChange={(e) => setDailyTotal(e.target.value)}
            min="500"
            max="10000"
            required
          />
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          Optionally set per-meal budgets (used for AI suggestions):
        </p>

        <div className="goals-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label htmlFor="breakfast">Breakfast</label>
            <input id="breakfast" type="number" value={breakfast} onChange={(e) => setBreakfast(e.target.value)} placeholder="e.g. 400" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="lunch">Lunch</label>
            <input id="lunch" type="number" value={lunch} onChange={(e) => setLunch(e.target.value)} placeholder="e.g. 600" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="dinner">Dinner</label>
            <input id="dinner" type="number" value={dinner} onChange={(e) => setDinner(e.target.value)} placeholder="e.g. 700" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="snacks">Snacks</label>
            <input id="snacks" type="number" value={snacks} onChange={(e) => setSnacks(e.target.value)} placeholder="e.g. 300" min="0" />
          </div>
        </div>

        {mealTotal > 0 && (
          <p style={{
            fontSize: '0.85rem',
            color: mealTotal > parseInt(dailyTotal) ? 'var(--color-danger)' : 'var(--color-text-secondary)',
            marginBottom: '1rem',
          }}>
            Meal budgets total: {mealTotal} / {dailyTotal} cal
          </p>
        )}

        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem', marginTop: '1.5rem' }}>
          Optionally set daily macro targets:
        </p>

        <div className="goals-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
          <div className="form-group">
            <label htmlFor="proteinGoal">Protein (g)</label>
            <input id="proteinGoal" type="number" value={proteinGoal} onChange={(e) => setProteinGoal(e.target.value)} placeholder="e.g. 150" min="0" step="1" />
          </div>
          <div className="form-group">
            <label htmlFor="carbsGoal">Carbs (g)</label>
            <input id="carbsGoal" type="number" value={carbsGoal} onChange={(e) => setCarbsGoal(e.target.value)} placeholder="e.g. 250" min="0" step="1" />
          </div>
          <div className="form-group">
            <label htmlFor="fatGoal">Fat (g)</label>
            <input id="fatGoal" type="number" value={fatGoal} onChange={(e) => setFatGoal(e.target.value)} placeholder="e.g. 65" min="0" step="1" />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label htmlFor="targetWeight">Target weight (lbs)</label>
          <input id="targetWeight" type="number" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} placeholder="e.g. 170" min="50" step="0.1" />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={updateGoals.isPending}
          style={{ width: '100%', padding: '0.625rem' }}
        >
          {updateGoals.isPending ? 'Saving...' : 'Save Goals'}
        </button>
      </form>
    </div>
  );
}
