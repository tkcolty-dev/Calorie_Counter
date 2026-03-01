exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('challenges', {
    id: 'id',
    creator_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    title: { type: 'varchar(200)', notNull: true },
    description: { type: 'text' },
    challenge_type: { type: 'varchar(50)', notNull: true },
    target_value: { type: 'integer', notNull: true },
    start_date: { type: 'date', notNull: true },
    end_date: { type: 'date', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('challenge_participants', {
    id: 'id',
    challenge_id: { type: 'integer', notNull: true, references: 'challenges', onDelete: 'CASCADE' },
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    joined_at: { type: 'timestamp', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.addConstraint('challenge_participants', 'challenge_participants_unique', {
    unique: ['challenge_id', 'user_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('challenge_participants');
  pgm.dropTable('challenges');
};
