/*
  Warnings:

  - Made the column `format` on table `tournaments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `matches` ADD COLUMN `stage` VARCHAR(191) NOT NULL DEFAULT 'MAIN';

-- AlterTable
ALTER TABLE `tournaments` ADD COLUMN `playoff_teams` INTEGER NULL,
    MODIFY `format` VARCHAR(191) NOT NULL DEFAULT 'TOURNAMENT';
