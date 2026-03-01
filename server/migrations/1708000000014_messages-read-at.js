exports.up = (pgm) => {
  pgm.createTable('message_reads', {
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
      unique: true,
    },
    last_read_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('message_reads');
};
