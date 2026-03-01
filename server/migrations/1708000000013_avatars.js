exports.shpiority = false;

exports.up = (pgm) => {
  pgm.createTable('avatars', {
    user_id: { type: 'integer', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    filename: { type: 'text', notNull: true },
    mime_type: { type: 'text', notNull: true },
    data: { type: 'bytea', notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('avatars');
};
