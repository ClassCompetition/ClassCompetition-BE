-- AlterTable
ALTER TABLE `tournament_teams` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `tournaments` ADD COLUMN `group_count` INTEGER NULL,
    ADD COLUMN `target_team_count` INTEGER NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `department` VARCHAR(191) NULL;
