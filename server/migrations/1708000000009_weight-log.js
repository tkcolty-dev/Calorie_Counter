exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('weight_log', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    weight_lbs: { type: 'numeric(5,1)', notNull: true },
    logged_date: { type: 'date', notNull: true },
    notes: { type: 'text' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.addConstraint('weight_log', 'weight_log_user_date_unique', {
    unique: ['user_id', 'logged_date'],
  });
  pgm.addColumns('calorie_goals', {
    target_weight_lbs: { type: 'numeric(5,1)', default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('calorie_goals', ['target_weight_lbs']);
  pgm.dropTable('weight_log');
};
