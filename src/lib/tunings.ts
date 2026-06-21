export interface TuningInfo {
  tuning: string;
  role: "Guitar" | "Bass";
}

export function getSongTunings(song: {
  roleGroups: {
    role: string;
    tracks: {
      instrumentName: string;
      role: string;
      details: string | null;
      tuning: string;
    }[];
  }[];
}): TuningInfo[] {
  const tunings: TuningInfo[] = [];
  const seenKeys = new Set<string>();

  song.roleGroups?.forEach((rg) => {
    if (rg.role === "Guitar" || rg.role === "Bass") {
      rg.tracks?.forEach((t) => {
        if (t.tuning) {
          const tuningStr = t.tuning.trim();
          const role = rg.role as "Guitar" | "Bass";
          const uniqueKey = `${role}:${tuningStr}`;

          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            tunings.push({
              tuning: tuningStr,
              role,
            });
          }
        }
      });
    }
  });

  return tunings;
}
