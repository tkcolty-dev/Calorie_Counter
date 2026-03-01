exports.up = (pgm) => {
  // Add macros to meals
  pgm.addColumns('meals', {
    protein_g: { type: 'numeric(6,1)', notNull: false },
    carbs_g: { type: 'numeric(6,1)', notNull: false },
    fat_g: { type: 'numeric(6,1)', notNull: false },
  });

  // Add macros to custom_meals
  pgm.addColumns('custom_meals', {
    protein_g: { type: 'numeric(6,1)', notNull: false },
    carbs_g: { type: 'numeric(6,1)', notNull: false },
    fat_g: { type: 'numeric(6,1)', notNull: false },
  });

  // Add macros to planned_meals
  pgm.addColumns('planned_meals', {
    protein_g: { type: 'numeric(6,1)', notNull: false },
    carbs_g: { type: 'numeric(6,1)', notNull: false },
    fat_g: { type: 'numeric(6,1)', notNull: false },
  });

  // Add macros to food_database
  pgm.addColumns('food_database', {
    protein_g: { type: 'numeric(6,1)', notNull: false },
    carbs_g: { type: 'numeric(6,1)', notNull: false },
    fat_g: { type: 'numeric(6,1)', notNull: false },
  });

  // Add macro goals to calorie_goals
  pgm.addColumns('calorie_goals', {
    protein_goal_g: { type: 'numeric(6,1)', notNull: false },
    carbs_goal_g: { type: 'numeric(6,1)', notNull: false },
    fat_goal_g: { type: 'numeric(6,1)', notNull: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('meals', ['protein_g', 'carbs_g', 'fat_g']);
  pgm.dropColumns('custom_meals', ['protein_g', 'carbs_g', 'fat_g']);
  pgm.dropColumns('planned_meals', ['protein_g', 'carbs_g', 'fat_g']);
  pgm.dropColumns('food_database', ['protein_g', 'carbs_g', 'fat_g']);
  pgm.dropColumns('calorie_goals', ['protein_goal_g', 'carbs_goal_g', 'fat_goal_g']);
};
