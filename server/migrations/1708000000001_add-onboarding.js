exports.up = (pgm) => {
  pgm.addColumn('users', {
    onboarding_complete: { type: 'boolean', notNull: true, default: true },
  });
  // New users will get false via the register endpoint
};

exports.down = (pgm) => {
  pgm.dropColumn('users', 'onboarding_complete');
};
