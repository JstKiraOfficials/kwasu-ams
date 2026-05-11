# Migrations

Migration files are generated in Phase 05 after the full schema (Phases 02–04) is complete.

**Never edit an existing migration file.** Always generate a new migration with:

```bash
npx prisma migrate dev --name <descriptive-name>
```

Migration naming convention: `add_device_binding_approval_status`, not `migration_001`.
