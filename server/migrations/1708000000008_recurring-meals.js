exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('planned_meals', {
    recurrence: { type: 'varchar(20)', default: null },
    recurrence_end: { type: 'date', default: null },
    parent_id: { type: 'integer', default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('planned_meals', ['recurrence', 'recurrence_end', 'parent_id']);
};
