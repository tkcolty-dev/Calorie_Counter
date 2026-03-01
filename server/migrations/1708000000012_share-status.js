exports.up = (pgm) => {
  pgm.createTable('share_status', {
    share_id: {
      type: 'integer',
      primaryKey: true,
    },
    status: { type: 'varchar(20)', notNull: true, default: "'pending'" },
  });

  // Backfill existing shares as accepted
  pgm.sql(`
    INSERT INTO share_status (share_id, status)
    SELECT id, 'accepted' FROM shares
    ON CONFLICT (share_id) DO NOTHING
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('share_status');
};
