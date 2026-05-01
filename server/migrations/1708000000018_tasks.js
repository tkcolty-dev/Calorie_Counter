exports.up = (pgm) => {
  pgm.createTable('tasks', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_by: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    title: { type: 'varchar(255)', notNull: true },
    note: { type: 'text' },
    due_at: { type: 'timestamptz', notNull: true },
    completed_at: { type: 'timestamptz' },
    last_notified_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()'), notNull: true },
  });

  pgm.createIndex('tasks', 'user_id');
  pgm.createIndex('tasks', ['user_id', 'completed_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('tasks');
};
