exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('push_subscriptions', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    endpoint: { type: 'text', notNull: true },
    keys_p256dh: { type: 'text', notNull: true },
    keys_auth: { type: 'text', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.addConstraint('push_subscriptions', 'push_sub_endpoint_unique', {
    unique: ['user_id', 'endpoint'],
  });
  pgm.addColumns('calorie_goals', {
    notify_reminders: { type: 'boolean', default: true, notNull: true },
    notify_sharing: { type: 'boolean', default: true, notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('calorie_goals', ['notify_reminders', 'notify_sharing']);
  pgm.dropTable('push_subscriptions');
};
