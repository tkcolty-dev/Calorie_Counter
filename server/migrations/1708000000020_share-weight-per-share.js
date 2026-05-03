// Per-share weight visibility override. Stored in a satellite table
// (rather than as a column on `shares`) because the runtime DB role
// doesn't own the `shares` table on this deploy and ALTER TABLE
// fails. Same pattern as `share_status` (migration 12).
//
// Row present  → share_weight column wins (true or false).
// Row absent   → fall back to the owner's global 'share-weight' user_setting.

exports.up = (pgm) => {
  pgm.createTable('share_weight_overrides', {
    share_id: { type: 'integer', primaryKey: true, notNull: true },
    share_weight: { type: 'boolean', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('share_weight_overrides');
};
