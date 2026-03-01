exports.up = (pgm) => {
  pgm.createTable('user_timezones', {
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE', unique: true },
    tz_offset: { type: 'integer', notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('user_timezones');
};
