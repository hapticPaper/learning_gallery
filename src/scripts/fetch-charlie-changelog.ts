import fs from "node:fs/promises";
import path from "node:path";

import {
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
  hasRecentChangelog: boolean;
  latestEntry: CharlieChangelogSnapshotEntry | null;
};

const SNAPSHOT_PATH = path.join(process.cwd(), "src", "data", "charlie-changelog.json");

async function main() {
  const latest = await getLatestCharlieChangelogEntry({ cache: "no-store" });
  if (!latest) {
    console.log("Unable to fetch Charlie Labs changelog.");
    return;
  }

  const hasRecentChangelog = isChangelogEntryRecent(latest.date);
  const dateIso = Number.isNaN(latest.date.getTime()) ? null : latest.date.toISOString().slice(0, 10);

  const nextSnapshot: CharlieChangelogSnapshot = {
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
  const prevRaw = await fs.readFile(SNAPSHOT_PATH, "utf8").catch(() => null);
  if (prevRaw === nextRaw) {
    console.log("Charlie changelog snapshot is up to date.");
    return;
  }

  await fs.writeFile(SNAPSHOT_PATH, nextRaw, "utf8");
  console.log("Updated Charlie changelog snapshot.");
}

await main();
