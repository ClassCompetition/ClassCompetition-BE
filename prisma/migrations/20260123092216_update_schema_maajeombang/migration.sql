/*
  Warnings:

  - You are about to drop the column `ownerId` on the `team` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `user` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[inviteCode]` on the table `Team` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,teamId]` on the table `TeamMember` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[kakaoId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `writerId` to the `Tactic` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inviteCode` to the `Team` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `tactic` ADD COLUMN `writerId` INTEGER NOT NULL,
    MODIFY `isPrivate` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `team` DROP COLUMN `ownerId`,
    ADD COLUMN `description` VARCHAR(191) NULL,
    ADD COLUMN `inviteCode` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `user` DROP COLUMN `studentId`,
    ADD COLUMN `age` INTEGER NULL,
    ADD COLUMN `kakaoId` VARCHAR(191) NULL,
    ADD COLUMN `lolProfile` JSON NULL,
    ADD COLUMN `sportProfile` JSON NULL,
    MODIFY `email` VARCHAR(191) NULL,
    MODIFY `point` INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE `Tournament` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `managerId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `sportType` VARCHAR(191) NOT NULL,
    `ruleType` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL DEFAULT 'RECRUITING',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Team_inviteCode_key` ON `Team`(`inviteCode`);

-- CreateIndex
CREATE UNIQUE INDEX `TeamMember_userId_teamId_key` ON `TeamMember`(`userId`, `teamId`);

-- CreateIndex
CREATE UNIQUE INDEX `User_kakaoId_key` ON `User`(`kakaoId`);

-- AddForeignKey
ALTER TABLE `Tournament` ADD CONSTRAINT `Tournament_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
