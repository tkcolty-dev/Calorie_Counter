exports.up = (pgm) => {
  pgm.createTable('custom_meals', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    name: { type: 'varchar(255)', notNull: true },
    meal_type: { type: 'varchar(20)', notNull: true },
    calories: { type: 'integer', notNull: true },
    ingredients: { type: 'text' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('custom_meals', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('custom_meals');
};
