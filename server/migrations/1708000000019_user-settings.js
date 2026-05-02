exports.up = (pgm) => {
  // One row per user, one JSONB blob of UI preferences (theme, home-screen
  // button visibility, dashboard card flags, etc.). Kept separate from the
  // existing 'preferences' table which is for food preferences.
  pgm.createTable('user_settings', {
    user_id: {
      type: 'integer',
      primaryKey: true,
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    settings: { type: 'jsonb', notNull: true, default: '{}' },
    updated_at: { type: 'timestamptz', default: pgm.func('NOW()'), notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('user_settings');
};
