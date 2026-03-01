exports.up = (pgm) => {
  pgm.createTable('users', {
    id: 'id',
    username: { type: 'varchar(100)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('calorie_goals', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
      unique: true,
    },
    daily_total: { type: 'integer', notNull: true, default: 2000 },
    breakfast: { type: 'integer' },
    lunch: { type: 'integer' },
    dinner: { type: 'integer' },
    snacks: { type: 'integer' },
  });

  pgm.createTable('meals', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    meal_type: { type: 'varchar(20)', notNull: true },
    name: { type: 'varchar(255)', notNull: true },
    calories: { type: 'integer', notNull: true },
    notes: { type: 'text' },
    logged_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('meals', ['user_id', 'logged_at']);

  pgm.createTable('food_preferences', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    preference_type: { type: 'varchar(50)', notNull: true },
    value: { type: 'varchar(255)', notNull: true },
  });
  pgm.createIndex('food_preferences', 'user_id');

  pgm.createTable('food_database', {
    id: 'id',
    name: { type: 'varchar(255)', notNull: true },
    category: { type: 'varchar(100)', notNull: true },
    calories_per_serving: { type: 'integer', notNull: true },
    serving_size: { type: 'varchar(100)', notNull: true },
    search_vector: { type: 'tsvector' },
  });
  pgm.createIndex('food_database', 'search_vector', { method: 'gin' });

  // Trigger to auto-update search_vector
  pgm.sql(`
    CREATE OR REPLACE FUNCTION food_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english', COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.category, ''));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER food_search_vector_trigger
    BEFORE INSERT OR UPDATE ON food_database
    FOR EACH ROW EXECUTE FUNCTION food_search_vector_update();
  `);

  pgm.createTable('shares', {
    id: 'id',
    owner_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    viewer_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.addConstraint('shares', 'shares_unique_pair', { unique: ['owner_id', 'viewer_id'] });
};

exports.down = (pgm) => {
  pgm.dropTable('shares');
  pgm.dropTable('food_database');
  pgm.sql('DROP FUNCTION IF EXISTS food_search_vector_update CASCADE');
  pgm.dropTable('food_preferences');
  pgm.dropTable('meals');
  pgm.dropTable('calorie_goals');
  pgm.dropTable('users');
};
