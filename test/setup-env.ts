process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DB_HOST = process.env.TEST_DB_HOST ?? '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT ?? '5434';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'inventory_test';
process.env.DB_USERNAME = process.env.TEST_DB_USERNAME ?? 'inventory_test';
process.env.DB_PASSWORD =
  process.env.TEST_DB_PASSWORD ?? 'inventory_test_local';
process.env.DB_SCHEMA = 'public';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'unit-integration-test-jwt-secret-32-bytes';
