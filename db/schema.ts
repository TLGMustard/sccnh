import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  overview: text('overview').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
});

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  blurb: text('blurb').notNull(),
  walkingNote: text('walking_note').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  training: text('training', { enum: ['general', 'lead'] }).notNull(),
});

export const shifts = sqliteTable(
  'shifts',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    locationId: text('location_id').notNull().references(() => locations.id),
    taskId: text('task_id').notNull().references(() => tasks.id),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    capacity: integer('capacity').notNull(),
    title: text('title'),
    description: text('description'),
  },
  (table) => [index('idx_shifts_day_start').on(table.day, table.startsAt)],
);

export const volunteers = sqliteTable(
  'volunteers',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('uq_volunteers_email').on(table.email)],
);

export const signups = sqliteTable(
  'signups',
  {
    id: text('id').primaryKey(),
    volunteerId: text('volunteer_id').notNull().references(() => volunteers.id),
    shiftId: text('shift_id').notNull().references(() => shifts.id),
    status: text('status', { enum: ['confirmed', 'cancelled', 'checked_in'] }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_signups_volunteer_shift').on(table.volunteerId, table.shiftId),
    index('idx_signups_shift_status').on(table.shiftId, table.status),
  ],
);

export const trainings = sqliteTable(
  'trainings',
  {
    id: text('id').primaryKey(),
    volunteerId: text('volunteer_id').notNull().references(() => volunteers.id),
    type: text('type', { enum: ['general', 'lead'] }).notNull(),
    completedAt: text('completed_at').notNull(),
    completedBy: text('completed_by').notNull(),
  },
  (table) => [uniqueIndex('uq_trainings_volunteer_type').on(table.volunteerId, table.type)],
);

export const seedVersions = sqliteTable('seed_versions', {
  version: text('version').primaryKey(),
  appliedAt: text('applied_at').notNull(),
});
