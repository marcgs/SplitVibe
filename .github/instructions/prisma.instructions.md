---
applyTo: "prisma/**"
---

# Prisma Schema Conventions

- Model names: PascalCase (`User`, `GroupMember`, `ExpenseSplit`).
- Field names: camelCase (`createdAt`, `groupId`).
- Enum values: SCREAMING_SNAKE_CASE (`EQUAL`, `PERCENTAGE`, `SHARES`).
- IDs: `String @id @default(cuid())`.
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Soft deletes: `deletedAt DateTime?` (null = active).
- Money fields: `Decimal @db.Decimal(14, 4)`.
- Relations: singular name for belongsTo (`group Group`), plural for hasMany (`members GroupMember[]`).
- Cascade deletes on child relations: `onDelete: Cascade`.
- Composite uniqueness: `@@unique([groupId, userId])`.
- Add `@@index` for fields used in frequent queries.
