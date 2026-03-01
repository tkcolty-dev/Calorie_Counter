exports.up = (pgm) => {
  pgm.createTable('share_comments', {
    id: 'id',
    share_id: {
      type: 'integer',
      notNull: true,
      references: 'shares',
      onDelete: 'CASCADE',
    },
    sender_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    text: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('share_comments', 'share_id');

  pgm.addColumn('shares', {
    share_planned: { type: 'boolean', default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('share_comments');
  pgm.dropColumn('shares', 'share_planned');
};
