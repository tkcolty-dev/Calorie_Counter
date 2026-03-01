exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('custom_meals', {
    template_items: { type: 'jsonb', default: null },
    is_template: { type: 'boolean', default: false, notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('custom_meals', ['template_items', 'is_template']);
};
