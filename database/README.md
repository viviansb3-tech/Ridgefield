# Phase 9 Database Setup

1. Create a MySQL/MariaDB database and application user.
2. Run `schema.sql` as an administrator.
3. Configure these environment variables for the PHP process:
   RF_DB_HOST, RF_DB_PORT, RF_DB_NAME, RF_DB_USER, RF_DB_PASS
4. Open `/cms/` and sign in.
5. Open `/cms/migrate-to-db.php` as an administrator.
6. Confirm `/cms/database-status.php` reports CONNECTED and the expected collections.
7. Keep the original `storage/private/*.json` files as a backup until the database has been verified.
8. Do not commit `.env` or database passwords to Git.

The Phase 9 adapter preserves the existing application's collection API while storing records in MySQL/MariaDB. This reduces the risk of rewriting every CMS module at once. A later hardening phase can normalize high-volume entities into dedicated relational tables with foreign keys.
