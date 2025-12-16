import fs from "node:fs/promises";
import path from "node:path";

import {
  RECENT_CHANGELOG_WINDOW_DAYS,
  isChangelogEntryRecent,
  getLatestCharlieChangelogEntry,
} from "../lib/charlieChangelog";

type CharlieChangelogSnapshotEntry = {
  id: string;
  title: string;
  dateText: string;
  dateIso: string | null;
  url: string;
};

type CharlieChangelogSnapshot = {
  windowDays: number;
  hasRecentChangelog: boolean;
  latestEntry: CharlieChangelogSnapshotEntry | null;
};

const SNAPSHOT_PATH = path.join(process.cwd(), "src", "data", "charlie-changelog.json");

async function main() {
  try {
    const latest = await getLatestCharlieChangelogEntry({ cache: "no-store" });
    if (!latest) {
      console.log("Unable to fetch Charlie Labs changelog.");
      return;
    }

    const hasRecentChangelog = isChangelogEntryRecent(latest.date);
    const dateIso = Number.isNaN(latest.date.getTime()) ? null : latest.date.toISOString().slice(0, 10);

    const nextSnapshot: CharlieChangelogSnapshot = {
      windowDays: RECENT_CHANGELOG_WINDOW_DAYS,
      hasRecentChangelog,
      latestEntry: {
        id: latest.id,
        title: latest.title,
        dateText: latest.dateText,
        dateIso,
        url: latest.url,
      },
    };

    await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });

    const nextRaw = `${JSON.stringify(nextSnapshot, null, 2)}\n`;
    const prevRaw = await readFileIfExists(SNAPSHOT_PATH);
    if (prevRaw === nextRaw) {
      console.log("Charlie changelog snapshot is up to date.");
      return;
    }

    await fs.writeFile(SNAPSHOT_PATH, nextRaw, "utf8");
    console.log("Updated Charlie changelog snapshot.");
  } catch (error) {
    console.error("Failed to update Charlie changelog snapshot:", error);
    process.exitCode = 1;
  }
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

void main();
