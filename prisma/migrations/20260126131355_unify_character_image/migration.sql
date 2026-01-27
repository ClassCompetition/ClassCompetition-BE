/*
  Warnings:

  - You are about to drop the column `character_image_url` on the `user_profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `user_profiles` DROP COLUMN `character_image_url`;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `character_image_url` VARCHAR(191) NULL;
