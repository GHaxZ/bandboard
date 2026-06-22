"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { getSongs, deleteSong } from "@/app/actions/songs";
import { getRehearsals, deleteRehearsal, getRehearsalDetails } from "@/app/actions/rehearsals";
import { checkSecret, isSecretRequired } from "@/app/actions/auth";
import {
  getUserSettings,
  saveUserSettings,
  exportUserData,
  importUserData,
  getAllSongProgress,
  saveSongProgress,
} from "@/app/actions/user";
import { SongDashboard } from "./SongDashboard";
import { KanbanBoard } from "./KanbanBoard";
import { SetlistManager } from "./SetlistManager";
import { PracticeMode } from "./PracticeMode";
import { RehearsalAutoplay } from "./RehearsalAutoplay";
import { AddSongModal } from "./AddSongModal";
import { AddRehearsalModal } from "./AddRehearsalModal";
import { EditRehearsalModal } from "./EditRehearsalModal";
import { PrivateIndicator } from "./PrivateIndicator";
import { SearchInput } from "./SearchInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getSongTunings } from "@/lib/tunings";
import { cn } from "@/lib/utils";
import {
  Calendar as CalendarIcon,
  Music as MusicIcon,
  Settings as SettingsIcon,
  Plus,
  Search,
  ArrowLeft,
  Clock,
  Lock,
  Loader2,
  FileText,
  Sliders,
  CheckCircle,
  Edit,
  Copy,
  Download,
  Upload,
  RefreshCw,
  Check,
  Play,
  ListMusic,
} from "lucide-react";

interface Track {
  id: string;
  roleGroupId: string;
  instrumentName: string;
  role: string;
  details: string | null;
  tuning: string;
  tabLink: string;
}

interface RoleGroup {
  id: string;
  songId: string;
  role: string;
  backingTrackLink: string | null;
  tabVideoLink: string | null;
  tracks: Track[];
}

interface Song {
  id: string;
  title: string;
  artist: string;
  songsterrId: number | null;
  albumArt: string | null;
  lyrics?: string | null;
  createdAt: number;
  roleGroups: RoleGroup[];
}

interface RehearsalSong {
  rehearsalId: string;
  songId: string;
  sortOrder: number;
  song: Song;
}

interface Rehearsal {
  id: string;
  title: string;
  date: number;
  notes: string | null;
  rehearsalSongs: {
    song: Song;
  }[];
}

interface RehearsalDetails {
  id: string;
  title: string;
  date: number;
  notes: string | null;
  rehearsalSongs: RehearsalSong[];
}

interface ClientDashboardProps {
  initialSongs: Song[];
  initialRehearsals: Rehearsal[];
}

export function ClientDashboard({ initialSongs, initialRehearsals }: ClientDashboardProps) {
  // Access control state
  const [isCheckingSecret, setIsCheckingSecret] = useState(true);
  const [isSecretNeeded, setIsSecretNeeded] = useState(false);
  const [isAuthVerified, setIsAuthVerified] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState("");

  // Navigation state: 'rehearsals' | 'songs' | 'settings'
  const [activeTab, setActiveTab] = useState<"rehearsals" | "songs" | "settings">("rehearsals");

  // Data states
  const [songsList, setSongsList] = useState<Song[]>(initialSongs);
  const [rehearsalsList, setRehearsalsList] = useState<Rehearsal[]>(initialRehearsals);

  // Active view detail states
  const [selectedRehearsalId, setSelectedRehearsalId] = useState<string | null>(null);
  const [selectedRehearsalDetails, setSelectedRehearsalDetails] = useState<RehearsalDetails | null>(null);
  const [selectedRehearsalSongId, setSelectedRehearsalSongId] = useState<string | null>(null);

  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  // Search filter states
  const [songSearchQuery, setSongSearchQuery] = useState("");

  // Dialog triggers
  const [isAddSongOpen, setIsAddSongOpen] = useState(false);
  const [isAddRehearsalOpen, setIsAddRehearsalOpen] = useState(false);
  const [isEditRehearsalOpen, setIsEditRehearsalOpen] = useState(false);

  // Profile preferences
  const [instrument, setInstrument] = useState("Guitar");

  // User settings and sync state
  const [userUuid, setUserUuid] = useState<string>("");
  const [progressMap, setProgressMap] = useState<Record<string, { status: string; speed: number; notes: string | null; practiceMarkers?: string | null; backingStartOffset?: number | null; tabStartOffset?: number | null }>>({});
  const [copySuccess, setCopySuccess] = useState(false);
  const [syncIdInput, setSyncIdInput] = useState("");
  const [syncError, setSyncError] = useState("");
  const [practiceSongId, setPracticeSongId] = useState<string | null>(null);
  const [autoplayRehearsalId, setAutoplayRehearsalId] = useState<string | null>(null);
  const [rehearsalViewMode, setRehearsalViewMode] = useState<"setlist" | "kanban">("setlist");

  const [, startTransition] = useTransition();

  // URL Parsing and auth verification on mount + user preferences and progress
  useEffect(() => {
    async function initUserAndAccess() {
      // 1. Capture token from URL
      const searchParams = new URLSearchParams(window.location.search);
      const secretParam = searchParams.get("secret");
      if (secretParam) {
        localStorage.setItem("bandboard_secret", secretParam);
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      }

      // 2. Query server if a secret token is required
      const required = await isSecretRequired();
      setIsSecretNeeded(required);

      if (required) {
        const storedSecret = localStorage.getItem("bandboard_secret") || "";
        const auth = await checkSecret(storedSecret);
        setIsAuthVerified(auth.isValid);
      } else {
        setIsAuthVerified(true);
      }
      setIsCheckingSecret(false);

      // 3. User anonymous identity
      const uid = localStorage.getItem("band_orchestrator_uid") || "";
      setUserUuid(uid);

      // 4. Load instrument preferences from DB or fallback
      const dbSettings = await getUserSettings();
      const savedInstrument = localStorage.getItem("bandboard_instrument") || "Guitar";
      
      let finalInst = "Guitar";
      if (dbSettings && dbSettings.preferredInstrument) {
        finalInst = dbSettings.preferredInstrument;
        localStorage.setItem("bandboard_instrument", dbSettings.preferredInstrument);
      } else if (savedInstrument) {
        finalInst = savedInstrument;
        await saveUserSettings(savedInstrument);
      }

      if (finalInst.toLowerCase() === "keyboard" || finalInst.toLowerCase() === "piano") {
        setInstrument("Piano/Keyboard");
      } else {
        setInstrument(finalInst);
      }

      // 5. Load progress list
      const progressList = await getAllSongProgress();
      const map: Record<string, { status: string; speed: number; notes: string | null; practiceMarkers?: string | null; backingStartOffset?: number | null; tabStartOffset?: number | null }> = {};
      progressList.forEach((p) => {
        map[p.songId] = {
          status: p.status,
          speed: p.speed,
          notes: p.notes,
          practiceMarkers: p.practiceMarkers,
          backingStartOffset: p.backingStartOffset,
          tabStartOffset: p.tabStartOffset,
        };
      });
      setProgressMap(map);
    }

    initUserAndAccess();
  }, []);

  // Sync data refresh helper
  async function refreshData() {
    startTransition(async () => {
      const updatedSongs = await getSongs();
      const updatedRehearsals = await getRehearsals();
      setSongsList(updatedSongs);
      setRehearsalsList(updatedRehearsals);

      // Refresh details if viewing a rehearsal
      if (selectedRehearsalId) {
        const details = await getRehearsalDetails(selectedRehearsalId);
        setSelectedRehearsalDetails(details);
      }

      // Refresh progress
      const progressList = await getAllSongProgress();
      const map: Record<string, { status: string; speed: number; notes: string | null; practiceMarkers?: string | null; backingStartOffset?: number | null; tabStartOffset?: number | null }> = {};
      progressList.forEach((p) => {
        map[p.songId] = {
          status: p.status,
          speed: p.speed,
          notes: p.notes,
          practiceMarkers: p.practiceMarkers,
          backingStartOffset: p.backingStartOffset,
          tabStartOffset: p.tabStartOffset,
        };
      });
      setProgressMap(map);
    });
  }

  // Handle password authentication
  async function handleAuthenticate(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const auth = await checkSecret(secretInput);
    if (auth.isValid) {
      localStorage.setItem("bandboard_secret", secretInput);
      setIsAuthVerified(true);
    } else {
      setAuthError("Incorrect password token. Please try again.");
    }
  }

  // Load rehearsal details when selected
  useEffect(() => {
    if (selectedRehearsalId) {
      getRehearsalDetails(selectedRehearsalId).then((details) => {
        setSelectedRehearsalDetails(details);
        if (details && details.rehearsalSongs.length > 0) {
          setSelectedRehearsalSongId(details.rehearsalSongs[0].songId);
        } else {
          setSelectedRehearsalSongId(null);
        }
      });
    } else {
      setSelectedRehearsalDetails(null);
      setSelectedRehearsalSongId(null);
    }
  }, [selectedRehearsalId]);


  // Handle instrument setting change
  async function handleInstrumentChange(val: string) {
    setInstrument(val);
    localStorage.setItem("bandboard_instrument", val);
    await saveUserSettings(val);
  }

  const handleCopyId = () => {
    if (typeof navigator !== "undefined" && userUuid) {
      navigator.clipboard.writeText(userUuid);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleSyncId = () => {
    setSyncError("");
    const trimmed = syncIdInput.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmed)) {
      setSyncError("Invalid Device ID format. Must be a valid UUID v4.");
      return;
    }

    localStorage.setItem("band_orchestrator_uid", trimmed);
    document.cookie = `band_orchestrator_uid=${trimmed}; path=/; max-age=${60 * 60 * 24 * 365 * 10}; SameSite=Lax`;
    window.location.reload();
  };

  const handleExportProfile = async () => {
    const result = await exportUserData();
    if (result.success && result.data) {
      const dataStr = JSON.stringify(result.data, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `bandboard_profile_${userUuid.substring(0, 8)}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      toast.success("Profile exported successfully!");
    } else {
      toast.error("Export failed: " + (result.error || "Unknown error"));
    }
  };

  const handleImportProfile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (!parsed.band_orchestrator_uid) {
            toast.error("Invalid file: No Device ID found.");
            return;
          }

          const res = await importUserData(parsed);
          if (res.success && res.userUuid) {
            localStorage.setItem("band_orchestrator_uid", res.userUuid);
            document.cookie = `band_orchestrator_uid=${res.userUuid}; path=/; max-age=${60 * 60 * 24 * 365 * 10}; SameSite=Lax`;
            toast.success("Profile imported successfully!");
            window.location.reload();
          } else {
            toast.error("Import failed: " + (res.error || "Database error"));
          }
        } catch (err) {
          toast.error("Failed to parse file as JSON.");
        }
      };
    }
  };

  // Delete song callback
  async function handleDeleteSong(songId: string) {
    if (confirm("Are you sure you want to delete this song and all its associated notation/media tracks?")) {
      const res = await deleteSong(songId);
      if (res.success) {
        setSelectedSongId(null);
        refreshData();
      }
    }
  }

  // Delete rehearsal callback
  async function handleDeleteRehearsal(rehearsalId: string) {
    if (confirm("Are you sure you want to delete this rehearsal prep session?")) {
      const res = await deleteRehearsal(rehearsalId);
      if (res.success) {
        setSelectedRehearsalId(null);
        refreshData();
      }
    }
  }

  // Filtered song list
  const filteredSongs = songsList.filter(
    (s) =>
      s.title.toLowerCase().includes(songSearchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(songSearchQuery.toLowerCase())
  );

  // Loading screen
  if (isCheckingSecret) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0c0d0e] text-[#f1f2f4] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#5b80a5]" />
        <p className="text-sm font-semibold text-[#888d96]">Loading BandBoard...</p>
      </div>
    );
  }

  // Authentication screen
  if (isSecretNeeded && !isAuthVerified) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0c0d0e] text-[#f1f2f4] p-4">
        <Card className="max-w-md w-full border-[#27282b] bg-[#161719] rounded-2xl shadow-2xl p-6">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 bg-[#27282b]/60 border border-[#3b3e45]/50 rounded-2xl flex items-center justify-center mb-3">
              <Lock className="w-5 h-5 text-[#888d96]" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-[#f1f2f4]">Enter Shared Secret</CardTitle>
            <CardDescription className="text-[#888d96] mt-1 text-xs">
              Access is protected. Enter your band&apos;s shared secret token to view sheets and tracks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuthenticate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="secretToken" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
                  Secret Password
                </Label>
                <Input
                  id="secretToken"
                  type="password"
                  required
                  placeholder="Enter shared secret..."
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
                />
              </div>

              {authError && <p className="text-xs font-semibold text-red-400 text-center">{authError}</p>}

              <Button type="submit" className="w-full bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl font-bold py-2.5">
                Unlock BandBoard
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (practiceSongId) {
    const song = songsList.find((s) => s.id === practiceSongId);
    if (song) {
      return (
        <PracticeMode
          song={song}
          onExit={() => setPracticeSongId(null)}
          onRefresh={refreshData}
          progressMap={progressMap}
          preferredInstrument={instrument}
        />
      );
    }
  }

  if (autoplayRehearsalId && selectedRehearsalDetails && selectedRehearsalDetails.id === autoplayRehearsalId) {
    return (
      <RehearsalAutoplay
        rehearsal={selectedRehearsalDetails}
        onExit={() => setAutoplayRehearsalId(null)}
        preferredInstrument={instrument}
        progressMap={progressMap}
      />
    );
  }

  // Main UI
  return (
    <div className={cn(
      "flex-1 flex flex-col bg-[#0c0d0e] text-[#f1f2f4] pb-20 md:pb-6",
      activeTab === "rehearsals" && selectedRehearsalId && rehearsalViewMode === "kanban" && "pb-20 md:pb-0"
    )}>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#0c0d0e]/80 backdrop-blur-lg border-b border-[#27282b] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#24272c] border border-[#3b3e45] flex items-center justify-center text-[#f1f2f4] font-black text-sm">
            BB
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-[#f1f2f4] leading-none">BandBoard</h1>
            <span className="text-[10px] font-bold text-[#888d96] flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5b80a5] animate-ping"></span> Live Setlist Sync
            </span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1.5 bg-[#161719] border border-[#27282b] p-1 rounded-xl">
          <button
            onClick={() => {
              setActiveTab("rehearsals");
              setSelectedRehearsalId(null);
              setSelectedSongId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
              activeTab === "rehearsals" ? "bg-[#27282b] text-[#f1f2f4]" : "text-[#888d96] hover:text-[#f1f2f4]"
            }`}
          >
            <CalendarIcon className="w-4 h-4" /> Rehearsals
          </button>
          <button
            onClick={() => {
              setActiveTab("songs");
              setSelectedRehearsalId(null);
              setSelectedSongId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
              activeTab === "songs" ? "bg-[#27282b] text-[#f1f2f4]" : "text-[#888d96] hover:text-[#f1f2f4]"
            }`}
          >
            <MusicIcon className="w-4 h-4" /> Song Library
          </button>
          <button
            onClick={() => {
              setActiveTab("settings");
              setSelectedRehearsalId(null);
              setSelectedSongId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
              activeTab === "settings" ? "bg-[#27282b] text-[#f1f2f4]" : "text-[#888d96] hover:text-[#f1f2f4]"
            }`}
          >
            <SettingsIcon className="w-4 h-4" /> Settings
          </button>
        </nav>
      </header>

      {/* Main Content Area - Full width on large displays, padding handles spacing */}
      <main className={cn(
        "flex-1 w-full max-w-none px-4 md:px-8 py-6 space-y-6",
        activeTab === "rehearsals" && selectedRehearsalId && rehearsalViewMode === "kanban" && "pb-4 md:pb-0"
      )}>
        {/* REHEARSALS TAB */}
        {activeTab === "rehearsals" && (
          <div className="space-y-6">
            {!selectedRehearsalId ? (
              // Rehearsals List View
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-[#f1f2f4] flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5 text-[#888d96]" />
                      Rehearsal Sessions
                    </h2>
                    <p className="text-xs text-[#888d96] mt-0.5">Organize setlists and check instrument tracks during practice.</p>
                  </div>
                  <Button
                    onClick={() => setIsAddRehearsalOpen(true)}
                    className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl shadow-md font-bold text-xs"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Schedule Prep
                  </Button>
                </div>

                {rehearsalsList.length === 0 ? (
                  <div className="text-center py-16 bg-[#161719]/40 border border-[#27282b] rounded-2xl p-6 text-[#888d96]">
                    <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-[#27282b]" />
                    <h3 className="font-semibold text-lg text-[#f1f2f4]">No Rehearsals Scheduled</h3>
                    <p className="text-sm mt-1">Get started by creating a practice session and adding songs.</p>
                    <Button
                      onClick={() => setIsAddRehearsalOpen(true)}
                      className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl mt-4 text-xs font-bold"
                    >
                      Schedule Your First Prep
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {rehearsalsList.map((reh) => {
                      const dateObj = new Date(reh.date);
                      return (
                        <Card
                          key={reh.id}
                          onClick={() => setSelectedRehearsalId(reh.id)}
                          className="border-[#27282b] bg-[#161719]/40 hover:bg-[#161719]/80 hover:border-[#383a3f] transition-all duration-200 cursor-pointer rounded-2xl overflow-hidden group shadow-lg py-0"
                        >
                          <CardHeader className="p-5 pb-3">
                            <span className="text-[10px] font-bold text-[#888d96] uppercase tracking-widest block">
                              {dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                            </span>
                            <CardTitle className="text-base font-bold text-[#f1f2f4] mt-1 line-clamp-1">
                              {reh.title}
                            </CardTitle>
                            {reh.notes && (
                              <CardDescription className="text-xs text-[#888d96] mt-1 line-clamp-2 leading-relaxed">
                                {reh.notes}
                              </CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="px-5 pb-5 pt-0 flex items-center justify-between text-xs text-[#888d96] border-t border-[#27282b]/60 mt-3 pt-3">
                            <span className="flex items-center gap-1 font-semibold text-[#888d96]">
                              <MusicIcon className="w-3.5 h-3.5 text-[#888d96]" /> {reh.rehearsalSongs?.length || 0} songs
                            </span>
                            <span className="flex items-center gap-1 font-semibold text-[#888d96]">
                              <Clock className="w-3.5 h-3.5 text-[#888d96]" />{" "}
                              {dateObj.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              // Rehearsal Detailed Setlist & Player View
              <div className="space-y-6">
                {/* Back Link Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#27282b] pb-5">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedRehearsalId(null)}
                      className="text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#161719] rounded-xl"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                      <h2 className="text-xl font-black text-[#f1f2f4] flex items-center gap-2">
                        {selectedRehearsalDetails?.title || "Loading..."}
                      </h2>
                      <p className="text-xs text-[#888d96] mt-0.5">
                        {selectedRehearsalDetails
                          ? new Date(selectedRehearsalDetails.date).toLocaleString(undefined, {
                              weekday: "long",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setIsEditRehearsalOpen(true)}
                      className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl text-xs font-bold px-3.5 h-9"
                    >
                      <Edit className="w-3.5 h-3.5 mr-1" /> Edit Details
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => selectedRehearsalDetails && handleDeleteRehearsal(selectedRehearsalDetails.id)}
                      className="bg-red-950/25 hover:bg-red-900/40 border border-red-950/40 text-red-400 hover:text-white rounded-xl text-xs font-bold px-3.5 h-9"
                    >
                      Delete Session
                    </Button>
                  </div>
                </div>

                {/* Rehearsal Tabs / View Mode Switcher */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-[#161719] border border-[#27282b] p-1 rounded-xl w-fit">
                    <button
                      onClick={() => setRehearsalViewMode("setlist")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                        rehearsalViewMode === "setlist"
                          ? "bg-[#27282b] text-[#f1f2f4]"
                          : "text-[#888d96] hover:text-[#f1f2f4]"
                      }`}
                    >
                      <ListMusic className="w-4 h-4" />
                      Setlist & Practice
                    </button>
                    <button
                      onClick={() => setRehearsalViewMode("kanban")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                        rehearsalViewMode === "kanban"
                          ? "bg-[#27282b] text-[#f1f2f4]"
                          : "text-[#888d96] hover:text-[#f1f2f4]"
                      }`}
                    >
                      <Sliders className="w-4 h-4" />
                      Kanban Board
                    </button>
                  </div>

                  {rehearsalViewMode === "kanban" && (
                    <PrivateIndicator
                      text="Only synced for you"
                      tooltip="Your practice progress and notes are kept private to your user session."
                    />
                  )}
                </div>

                {rehearsalViewMode === "setlist" ? (
                  <div className="space-y-6">
                    {selectedRehearsalDetails?.notes && (
                      <div className="bg-[#161719]/40 border border-[#27282b] rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-[#888d96]">
                        <FileText className="w-4 h-4 text-[#888d96] flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-[#f1f2f4] block mb-0.5 uppercase tracking-wide text-[10px]">
                            Session Notes
                          </span>
                          {selectedRehearsalDetails.notes}
                        </div>
                      </div>
                    )}

                    {/* Grid layout: Setlist Column (Left) & Dynamic Active Track Details Dashboard (Right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Setlist Column (Left) - Expanded layout width handles spacing */}
                      <div className="lg:col-span-4 bg-[#161719]/40 border border-[#27282b] rounded-2xl p-4 shadow-lg h-fit">
                        {selectedRehearsalDetails && (
                          <SetlistManager
                            rehearsalId={selectedRehearsalDetails.id}
                            rehearsalSongs={selectedRehearsalDetails.rehearsalSongs}
                            allSongs={songsList}
                            activeSongId={selectedRehearsalSongId}
                            onSelectSong={setSelectedRehearsalSongId}
                            onRefresh={refreshData}
                            progressMap={progressMap}
                            onPracticeSong={(songId) => setPracticeSongId(songId)}
                            onStartAutoplay={() => setAutoplayRehearsalId(selectedRehearsalDetails.id)}
                          />
                        )}
                      </div>

                      {/* Player Dashboard Column (Right) */}
                      <div className="lg:col-span-8">
                        {selectedRehearsalSongId ? (
                          (() => {
                            const currentRehSong = selectedRehearsalDetails?.rehearsalSongs.find(
                              (rs) => rs.songId === selectedRehearsalSongId
                            );
                            if (!currentRehSong) return null;
                            return (
                              <SongDashboard
                                song={currentRehSong.song}
                                onRefresh={refreshData}
                                onPractice={() => setPracticeSongId(currentRehSong.songId)}
                                preferredInstrument={instrument}
                              />
                            );
                          })()
                        ) : (
                          <div className="text-center py-20 bg-[#161719]/40 border border-[#27282b] rounded-2xl p-6 text-[#888d96]">
                            <MusicIcon className="w-12 h-12 mx-auto mb-3 text-[#27282b] animate-pulse" />
                            <h3 className="font-semibold text-[#888d96]">No Song Selected</h3>
                            <p className="text-xs mt-1">Select a song from the setlist on the left to load its notations and backing players.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  selectedRehearsalDetails && (
                    <KanbanBoard
                      rehearsalId={selectedRehearsalDetails.id}
                      rehearsalSongs={selectedRehearsalDetails.rehearsalSongs}
                      progressMap={progressMap}
                      onSaveProgress={async (songId, status) => {
                        const oldProgress = progressMap[songId] || { speed: 100, notes: null };
                        setProgressMap({
                          ...progressMap,
                          [songId]: {
                            ...oldProgress,
                            status,
                          },
                        });
                        const res = await saveSongProgress(songId, status, oldProgress.speed, oldProgress.notes);
                        if (!res.success) {
                          toast.error("Failed to save progress: " + res.error);
                        }
                        refreshData();
                      }}
                      onSelectSong={(songId) => {
                        setSelectedRehearsalSongId(songId);
                        setRehearsalViewMode("setlist");
                      }}
                      onPracticeSong={(songId) => {
                        setPracticeSongId(songId);
                      }}
                    />
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* SONG LIBRARY TAB */}
        {activeTab === "songs" && (
          <div className="space-y-6">
            {!selectedSongId ? (
              // Song List View
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-black text-[#f1f2f4] flex items-center gap-2">
                      <MusicIcon className="w-5 h-5 text-[#888d96]" />
                      Song Library
                    </h2>
                    <p className="text-xs text-[#888d96] mt-0.5">Master repository of notations, tracks, and metadata.</p>
                  </div>
                  <Button
                    onClick={() => setIsAddSongOpen(true)}
                    className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl shadow-md font-bold text-xs"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add New Song
                  </Button>
                </div>

                {/* Search query */}
                <SearchInput
                  placeholder="Search library by title or artist..."
                  value={songSearchQuery}
                  onChange={setSongSearchQuery}
                />

                {filteredSongs.length === 0 ? (
                  <div className="text-center py-16 bg-[#161719]/40 border border-[#27282b] rounded-2xl p-6 text-[#888d96]">
                    <MusicIcon className="w-12 h-12 mx-auto mb-3 text-[#27282b]" />
                    <h3 className="font-semibold text-lg text-[#f1f2f4]">No Songs Found</h3>
                    <p className="text-sm mt-1">Add a new song to download notation tabs, backing tracks and scores.</p>
                    <Button
                      onClick={() => setIsAddSongOpen(true)}
                      className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl mt-4 text-xs font-bold"
                    >
                      Add Your First Song
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSongs.map((song) => (
                      <Card
                        key={song.id}
                        onClick={() => setSelectedSongId(song.id)}
                        className="border-[#27282b] bg-[#161719]/40 hover:bg-[#161719]/80 hover:border-[#383a3f] transition-all duration-200 cursor-pointer rounded-2xl overflow-hidden group shadow-lg py-0"
                      >
                        <CardHeader className="p-5 flex flex-row items-center gap-4">
                          {song.albumArt && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={song.albumArt}
                              alt=""
                              className="w-12 h-12 rounded-xl object-cover border border-[#27282b] flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-[#888d96] uppercase tracking-widest block">
                                {(song.roleGroups?.reduce((acc, rg) => acc + (rg.tracks?.length || 0), 0) || 0)} notation tracks
                              </span>
                              {(() => {
                                const progStatus = progressMap[song.id]?.status || "not_started";
                                return (
                                  <Badge
                                    className={cn(
                                      "text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border-0 shrink-0",
                                      progStatus === "mastered"
                                        ? "bg-emerald-950/40 text-emerald-400"
                                        : progStatus === "ready_to_play"
                                        ? "bg-purple-950/40 text-purple-400"
                                        : progStatus === "learning"
                                        ? "bg-sky-950/40 text-sky-400"
                                        : "bg-red-950/40 text-red-400"
                                    )}
                                  >
                                    {progStatus === "ready_to_play"
                                      ? "Ready to Play"
                                      : progStatus === "not_started"
                                      ? "Not learned"
                                      : progStatus === "learning"
                                      ? "Learning"
                                      : progStatus}
                                  </Badge>
                                );
                              })()}
                            </div>
                            <CardTitle className="text-base font-bold text-[#d1d1d6] mt-1 truncate group-hover:text-[#f1f2f4]">
                              {song.title}
                            </CardTitle>
                            <div className="flex flex-col gap-1.5 mt-1">
                              <CardDescription className="text-xs text-[#888d96] truncate font-medium">
                                by {song.artist}
                              </CardDescription>
                              {/* Tuning Badges */}
                              {(() => {
                                const songTunings = getSongTunings(song);
                                if (songTunings.length === 0) return null;
                                return (
                                  <div className="flex flex-wrap gap-1">
                                    {songTunings.map((ind) => {
                                      const isHighlighted = (instrument === "Guitar" && ind.role === "Guitar") || (instrument === "Bass" && ind.role === "Bass");
                                      return (
                                        <Badge
                                          key={`${ind.role}-${ind.tuning}`}
                                          className={cn(
                                            "text-[9px] font-mono tracking-wide px-1.5 py-0.5 border",
                                            isHighlighted
                                              ? "bg-[#2e4057] border-[#446285] text-[#acd1f8] hover:bg-[#344b67] hover:text-[#cde3fa]"
                                              : "bg-[#161719]/40 border-[#27282b] text-[#6c727a] hover:bg-[#1c1d21]/60 hover:text-[#b8c2d1]"
                                          )}
                                        >
                                          {ind.tuning}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </CardHeader>
                        <div className="border-t border-[#27282b]/60 px-5 py-3.5 bg-transparent flex items-center justify-between gap-2 mt-auto">
                          <span className="text-[10px] text-[#888d96] font-mono tracking-wider">
                            {(song.roleGroups?.length || 0)} instrument roles
                          </span>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPracticeSongId(song.id);
                            }}
                            className="bg-[#2e4057] hover:bg-[#344b67] border border-[#446285] text-[#acd1f8] hover:text-[#cde3fa] font-bold text-xs rounded-xl flex items-center gap-1.5 h-8 px-3 shadow cursor-pointer transition-all"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Practice
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Song Detail View
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-[#27282b] pb-5">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedSongId(null)}
                    className="text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#161719] rounded-xl"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <div>
                    <h2 className="text-lg font-black text-[#f1f2f4]">Library Details</h2>
                    <p className="text-xs text-[#888d96] mt-0.5">Inspect and customize tracks for this song.</p>
                  </div>
                </div>

                {(() => {
                  const currentSong = songsList.find((s) => s.id === selectedSongId);
                  if (!currentSong) return null;
                  return (
                    <SongDashboard
                      song={currentSong}
                      onRefresh={refreshData}
                      onDelete={() => handleDeleteSong(currentSong.id)}
                      onPractice={() => setPracticeSongId(currentSong.id)}
                      preferredInstrument={instrument}
                    />
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-black text-[#f1f2f4] flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-[#888d96]" />
                Settings & Preferences
              </h2>
              <p className="text-xs text-[#888d96] mt-0.5">Customize your instrument settings and view identity preferences.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Instrument Setting */}
              <Card className="border-[#27282b] bg-[#161719]/40 rounded-2xl shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-[#f1f2f4] flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#888d96]" />
                    My Role (Instrument)
                  </CardTitle>
                  <CardDescription className="text-xs text-[#888d96] mt-1">
                    Select your main role. When viewing a song dashboard, details for this instrument category will be shown by default.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {["Guitar", "Bass", "Drums", "Vocals", "Piano/Keyboard", "Other"].map((inst) => {
                      const isSelected = instrument.toLowerCase() === inst.toLowerCase();
                      return (
                        <Button
                          key={inst}
                          variant={isSelected ? "default" : "outline"}
                          onClick={() => handleInstrumentChange(inst)}
                          className={`rounded-xl h-11 font-bold text-xs ${
                            isSelected
                              ? "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] border-0"
                              : "border-[#27282b] bg-[#0c0d0e]/40 text-[#888d96] hover:bg-[#27282b] hover:text-[#f1f2f4]"
                          }`}
                        >
                          {inst}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#888d96] bg-[#0c0d0e]/40 border border-[#27282b] p-3 rounded-xl leading-relaxed">
                    <CheckCircle className="w-4 h-4 text-[#5b80a5] shrink-0" />
                    <span>
                      Your role is saved locally on this device as{" "}
                      <strong className="font-bold text-[#f1f2f4]">{instrument}</strong>.
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Shared Secret Settings */}
              <Card className="border-[#27282b] bg-[#161719]/40 rounded-2xl shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-[#f1f2f4] flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#888d96]" />
                    Authentication Secret
                  </CardTitle>
                  <CardDescription className="text-xs text-[#888d96] mt-1">
                    Manage your access token for this deployment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs text-[#888d96] leading-relaxed font-medium">
                      If your band administrator has set an access password, you must be logged in to view setlists. You are currently authenticated.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        localStorage.removeItem("bandboard_secret");
                        window.location.reload();
                      }}
                      className="border-[#27282b] bg-[#0c0d0e]/40 text-red-400 hover:bg-red-950/20 hover:text-red-300 rounded-xl text-xs font-bold py-1.5 h-9"
                    >
                      Clear Saved Secret (Log Out)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Practice Sync & Backup Card */}
            <Card className="border-[#27282b] bg-[#161719]/40 rounded-2xl shadow-lg mt-6">
              <CardHeader>
                <CardTitle className="text-base font-bold text-[#f1f2f4] flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#888d96]" />
                  Practice Data & Device Sync
                </CardTitle>
                <CardDescription className="text-xs text-[#888d96] mt-1">
                  Your practice speed preferences, learning logs, and notes are automatically saved under your anonymous ID. Sync this ID or import/export files to share settings across multiple devices and browsers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Identity Display */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#888d96] uppercase tracking-wider block">Your Anonymous Device ID</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-[#0c0d0e] border border-[#27282b] text-xs text-[#5b80a5] font-mono px-4 py-3 rounded-xl select-all break-all leading-normal">
                      {userUuid || "Generating..."}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyId}
                      className="h-11 w-11 border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] rounded-xl flex-shrink-0 text-[#888d96] hover:text-[#f1f2f4]"
                      title="Copy Device ID"
                    >
                      {copySuccess ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* Sync Section */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-[#888d96] uppercase tracking-wider block">Sync Another Device</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste another device's ID..."
                        value={syncIdInput}
                        onChange={(e) => setSyncIdInput(e.target.value)}
                        className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] text-xs px-3 focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl h-10"
                      />
                      <Button
                        onClick={handleSyncId}
                        className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] text-xs font-bold px-4 h-10 rounded-xl flex-shrink-0"
                      >
                        Sync ID
                      </Button>
                    </div>
                    {syncError && <p className="text-xs text-red-400 font-semibold">{syncError}</p>}
                  </div>

                  {/* Backup/Import Section */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-[#888d96] uppercase tracking-wider block">Backup &amp; Import Profile</label>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={handleExportProfile}
                        variant="outline"
                        className="border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] text-xs font-bold text-[#acd1f8] hover:text-[#f1f2f4] py-2 h-10 px-4 rounded-xl flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export Profile
                      </Button>
                      
                      <div className="relative">
                        <input
                          type="file"
                          accept=".json"
                          id="profile-import-file"
                          onChange={handleImportProfile}
                          className="hidden"
                        />
                        <Button
                          onClick={() => document.getElementById("profile-import-file")?.click()}
                          variant="outline"
                          className="border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] text-xs font-bold text-[#acd1f8] hover:text-[#f1f2f4] py-2 h-10 px-4 rounded-xl flex items-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Import Profile
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Sticky Bottom Navigation Bar for Mobile */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#161719]/90 backdrop-blur-lg border-t border-[#27282b] px-6 py-2.5 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => {
            setActiveTab("rehearsals");
            setSelectedRehearsalId(null);
            setSelectedSongId(null);
          }}
          className={`flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200 ${
            activeTab === "rehearsals" ? "text-[#f1f2f4] scale-105" : "text-[#888d96] hover:text-[#f1f2f4]"
          }`}
        >
          <CalendarIcon className="w-5 h-5" />
          Rehearsals
        </button>
        <button
          onClick={() => {
            setActiveTab("songs");
            setSelectedRehearsalId(null);
            setSelectedSongId(null);
          }}
          className={`flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200 ${
            activeTab === "songs" ? "text-[#f1f2f4] scale-105" : "text-[#888d96] hover:text-[#f1f2f4]"
          }`}
        >
          <MusicIcon className="w-5 h-5" />
          Library
        </button>
        <button
          onClick={() => {
            setActiveTab("settings");
            setSelectedRehearsalId(null);
            setSelectedSongId(null);
          }}
          className={`flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200 ${
            activeTab === "settings" ? "text-[#f1f2f4] scale-105" : "text-[#888d96] hover:text-[#f1f2f4]"
          }`}
        >
          <SettingsIcon className="w-5 h-5" />
          Settings
        </button>
      </footer>

      {/* Modals */}
      <AddSongModal
        isOpen={isAddSongOpen}
        onClose={() => setIsAddSongOpen(false)}
        onSuccess={refreshData}
      />
      
      <AddRehearsalModal
        isOpen={isAddRehearsalOpen}
        onClose={() => setIsAddRehearsalOpen(false)}
        onSuccess={(id) => {
          refreshData();
          setSelectedRehearsalId(id);
        }}
      />

      {selectedRehearsalDetails && (
        <EditRehearsalModal
          isOpen={isEditRehearsalOpen}
          onClose={() => setIsEditRehearsalOpen(false)}
          rehearsal={selectedRehearsalDetails}
          onSuccess={refreshData}
        />
      )}
    </div>
  );
}
