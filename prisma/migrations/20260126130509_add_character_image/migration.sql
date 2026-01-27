/*
  Warnings:

  - You are about to drop the column `avatar_url` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `user_profiles` ADD COLUMN `character_image_url` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `avatar_url`;
