-- AlterTable
ALTER TABLE `tournaments` ADD COLUMN `bracket_generation` VARCHAR(191) NULL,
    ADD COLUMN `sport_type` VARCHAR(191) NOT NULL DEFAULT 'lol';

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_representative_tactic_id_fkey` FOREIGN KEY (`representative_tactic_id`) REFERENCES `tactics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
