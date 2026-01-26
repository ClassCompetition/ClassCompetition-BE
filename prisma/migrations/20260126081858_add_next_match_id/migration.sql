/*
  Warnings:

  - You are about to drop the column `scoreA` on the `match` table. All the data in the column will be lost.
  - You are about to drop the column `scoreB` on the `match` table. All the data in the column will be lost.
  - You are about to drop the column `teamAId` on the `match` table. All the data in the column will be lost.
  - You are about to drop the column `teamBId` on the `match` table. All the data in the column will be lost.
  - You are about to drop the column `data` on the `tactic` table. All the data in the column will be lost.
  - You are about to drop the column `isPrivate` on the `tactic` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `tactic` table. All the data in the column will be lost.
  - You are about to drop the column `ruleType` on the `tournament` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `tournament` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `tournament` table. All the data in the column will be lost.
  - You are about to drop the column `age` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `lolProfile` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `point` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `sportProfile` on the `user` table. All the data in the column will be lost.
  - You are about to drop the `bet` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[nickname]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[googleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `Tactic` table without a default value. This is not possible if the table is not empty.
  - Added the required column `positions` to the `Tactic` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Tactic` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sport` to the `Team` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Team` table without a default value. This is not possible if the table is not empty.
  - Added the required column `format` to the `Tournament` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Tournament` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sport` to the `Tournament` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `bet` DROP FOREIGN KEY `Bet_matchId_fkey`;

-- DropForeignKey
ALTER TABLE `bet` DROP FOREIGN KEY `Bet_userId_fkey`;

-- DropForeignKey
ALTER TABLE `match` DROP FOREIGN KEY `Match_teamAId_fkey`;

-- DropForeignKey
ALTER TABLE `match` DROP FOREIGN KEY `Match_teamBId_fkey`;

-- DropForeignKey
ALTER TABLE `match` DROP FOREIGN KEY `Match_tournamentId_fkey`;

-- AlterTable
ALTER TABLE `match` DROP COLUMN `scoreA`,
    DROP COLUMN `scoreB`,
    DROP COLUMN `teamAId`,
    DROP COLUMN `teamBId`,
    ADD COLUMN `location` VARCHAR(191) NULL,
    ADD COLUMN `scheduledAt` DATETIME(3) NULL,
    ADD COLUMN `stage` VARCHAR(191) NOT NULL DEFAULT 'TOURNAMENT',
    ADD COLUMN `team1Id` INTEGER NULL,
    ADD COLUMN `team1Score` INTEGER NULL,
    ADD COLUMN `team2Id` INTEGER NULL,
    ADD COLUMN `team2Score` INTEGER NULL,
    MODIFY `round` VARCHAR(191) NULL,
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled';

-- AlterTable
ALTER TABLE `tactic` DROP COLUMN `data`,
    DROP COLUMN `isPrivate`,
    DROP COLUMN `title`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `isLocked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `name` VARCHAR(191) NOT NULL,
    ADD COLUMN `positions` JSON NOT NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `writerId` INTEGER NULL;

-- AlterTable
ALTER TABLE `team` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `losses` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `sport` VARCHAR(191) NOT NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    ADD COLUMN `wins` INTEGER NOT NULL DEFAULT 0,
    MODIFY `description` TEXT NULL;

-- AlterTable
ALTER TABLE `teammember` ADD COLUMN `applicationData` JSON NULL,
    ADD COLUMN `backNumber` INTEGER NULL,
    ADD COLUMN `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `role` VARCHAR(191) NOT NULL DEFAULT 'member',
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE `tournament` DROP COLUMN `ruleType`,
    DROP COLUMN `state`,
    DROP COLUMN `title`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `endDate` DATETIME(3) NULL,
    ADD COLUMN `format` VARCHAR(191) NOT NULL,
    ADD COLUMN `hasPlayoff` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `name` VARCHAR(191) NOT NULL,
    ADD COLUMN `playoffTeams` INTEGER NULL,
    ADD COLUMN `prize` VARCHAR(191) NULL,
    ADD COLUMN `rules` TEXT NULL,
    ADD COLUMN `sport` VARCHAR(191) NOT NULL,
    ADD COLUMN `startDate` DATETIME(3) NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'recruiting';

-- AlterTable
ALTER TABLE `user` DROP COLUMN `age`,
    DROP COLUMN `lolProfile`,
    DROP COLUMN `point`,
    DROP COLUMN `sportProfile`,
    ADD COLUMN `avatar` VARCHAR(191) NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `department` VARCHAR(191) NULL,
    ADD COLUMN `googleId` VARCHAR(191) NULL,
    ADD COLUMN `name` VARCHAR(191) NULL,
    ADD COLUMN `password` VARCHAR(191) NULL,
    ADD COLUMN `points` INTEGER NOT NULL DEFAULT 1000,
    ADD COLUMN `refreshToken` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `email` VARCHAR(191) NOT NULL;

-- DropTable
DROP TABLE `bet`;

-- CreateTable
CREATE TABLE `SportProfile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sportType` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` INTEGER NOT NULL,

    UNIQUE INDEX `SportProfile_userId_sportType_key`(`userId`, `sportType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Prediction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `betAmount` INTEGER NOT NULL,
    `potentialWin` INTEGER NULL,
    `result` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` INTEGER NOT NULL,
    `matchId` INTEGER NOT NULL,
    `predictedTeamId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_nickname_key` ON `User`(`nickname`);

-- CreateIndex
CREATE UNIQUE INDEX `User_googleId_key` ON `User`(`googleId`);

-- AddForeignKey
ALTER TABLE `SportProfile` ADD CONSTRAINT `SportProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_team1Id_fkey` FOREIGN KEY (`team1Id`) REFERENCES `Team`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_team2Id_fkey` FOREIGN KEY (`team2Id`) REFERENCES `Team`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prediction` ADD CONSTRAINT `Prediction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prediction` ADD CONSTRAINT `Prediction_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
