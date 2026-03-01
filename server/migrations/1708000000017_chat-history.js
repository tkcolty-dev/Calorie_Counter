exports.up = (pgm) => {
  pgm.createTable('chat_messages', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    role: { type: 'varchar(20)', notNull: true },
    content: { type: 'text', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('chat_messages', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('chat_messages');
};
