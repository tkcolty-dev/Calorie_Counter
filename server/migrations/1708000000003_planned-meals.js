exports.up = (pgm) => {
  pgm.createTable('planned_meals', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    meal_type: { type: 'varchar(20)', notNull: true },
    name: { type: 'varchar(255)', notNull: true },
    calories: { type: 'integer', notNull: true },
    notes: { type: 'text' },
    planned_date: { type: 'date', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('planned_meals', ['user_id', 'planned_date']);
};

exports.down = (pgm) => {
  pgm.dropTable('planned_meals');
};
