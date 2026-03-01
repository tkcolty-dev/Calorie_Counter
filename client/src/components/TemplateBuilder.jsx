import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

export default function TemplateBuilder({ onClose }) {
  const [templateName, setTemplateName] = useState('');
  const [mealType, setMealType] = useState('lunch');
  const [items, setItems] = useState([{ name: '', calories: '' }]);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const createTemplate = useMutation({
    mutationFn: (data) => api.post('/custom-meals', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-meals'] });
      onClose();
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to save template'),
  });

  const addItem = () => setItems([...items, { name: '', calories: '' }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    setItems(next);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validItems = items.filter(it => it.name.trim() && it.calories);
    if (!templateName.trim() || validItems.length === 0) {
      setError('Template name and at least one item are required');
      return;
    }
    const totalCal = validItems.reduce((s, it) => s + parseInt(it.calories), 0);
    createTemplate.mutate({
      name: templateName.trim(),
      meal_type: mealType,
      calories: totalCal,
      is_template: true,
      template_items: validItems.map(it => ({ name: it.name.trim(), calories: parseInt(it.calories) })),
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>New Meal Template</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="tplName">Template name</label>
            <input id="tplName" type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. My Go-To Lunch" required />
          </div>

          <div className="form-group">
            <label htmlFor="tplType">Meal type</label>
            <select id="tplType" value={mealType} onChange={(e) => setMealType(e.target.value)}>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 6 }}>Items</label>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <input
                type="text" value={item.name} onChange={(e) => updateItem(i, 'name', e.target.value)}
                placeholder="Food name" style={{ flex: 2, padding: '0.4rem 0.6rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}
              />
              <input
                type="number" value={item.calories} onChange={(e) => updateItem(i, 'calories', e.target.value)}
                placeholder="Cal" min="0" style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}
              />
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '1.1rem' }}>&times;</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addItem} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', marginBottom: '1rem' }}>+ Add item</button>

          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
            Total: {items.reduce((s, it) => s + (parseInt(it.calories) || 0), 0)} cal
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createTemplate.isPending} style={{ flex: 1, padding: '0.625rem' }}>
              {createTemplate.isPending ? 'Saving...' : 'Save Template'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: '0.625rem 1.5rem' }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
