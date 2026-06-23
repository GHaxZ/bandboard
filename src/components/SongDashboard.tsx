"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, getAlternativeLinks } from "@/lib/utils";
import { updateTrackVideoLink, lazyLoadTrackMedia, getGeniusLyricsLinkAction } from "@/app/actions/songs";
import { VideoSelector } from "./VideoSelector";
import { PracticeLogCard } from "./PracticeLogCard";
import { PracticeButton } from "./PracticeButton";
import { Music, Play, Video, ExternalLink, Info, Trash, FileText, Loader2, ChevronDown } from "lucide-react";
import {
  getSongProgress,
  saveUserSettings
} from "@/app/actions/user";

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

interface SongDashboardProps {
  song: Song;
  onRefresh: () => void;
  onDelete?: () => void;
  onPractice?: () => void;
  preferredInstrument?: string;
}

function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match ? match[1] : null;
}

export function SongDashboard({ song, onRefresh, onDelete, onPractice, preferredInstrument }: SongDashboardProps) {
  const [activeTrackId, setActiveTrackId] = useState<string>("");
  const [initializedSongId, setInitializedSongId] = useState<string | null>(null);
  const [videoSelectorState, setVideoSelectorState] = useState<{
    isOpen: boolean;
    trackId: string;
    type: "backing" | "tab";
    instrumentName: string;
    currentUrl: string | null;
  } | null>(null);

  // States to manage lazy loading of YouTube links on demand
  const [isLazyLoading, setIsLazyLoading] = useState(false);
  const [lazyLoadedTrackId, setLazyLoadedTrackId] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Track selected non-standard instrument when "Other Instruments" tab is active
  const [selectedOtherTrackId, setSelectedOtherTrackId] = useState<string>("");

  // User progress state
  const [initialProgress, setInitialProgress] = useState<{ status: string; speed: number; notes: string } | null>(null);

  // Load progress when song.id changes
  useEffect(() => {
    async function loadSongUserData() {
      if (!song.id) return;
      
      const prog = await getSongProgress(song.id);
      if (prog) {
        setInitialProgress({ status: prog.status, speed: prog.speed, notes: prog.notes || "" });
      } else {
        setInitialProgress({ status: "not_started", speed: 100, notes: "" });
      }
    }
    
    loadSongUserData();
  }, [song.id]);

  // Track expanded state of additional notation tracks inside role groups
  const [isNotationExpanded, setIsNotationExpanded] = useState<Record<string, boolean>>({});

  const lastPreferredRef = useRef(preferredInstrument);

  // Smart initialization: select the roleGroup that matches the user's preferred instrument/role
  // ponytail: Auto-select based on preferredInstrument only when the song or the preference itself changes
  useEffect(() => {
    const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== "Other");
    const otherRoleGroup = song.roleGroups.find((rg) => rg.role === "Other");
    const otherTracks = otherRoleGroup?.tracks || [];
    
    if (song.id !== initializedSongId || lastPreferredRef.current !== preferredInstrument) {
      const preferredRole = preferredInstrument || localStorage.getItem("bandboard_instrument") || "Guitar";
      
      // Find matching role group for preferred role
      const matchingRoleGroup = standardRoleGroups.find(
        (rg) => rg.role.toLowerCase() === preferredRole.toLowerCase()
      );

      if (matchingRoleGroup) {
        setActiveTrackId(matchingRoleGroup.id);
      } else {
        // Fallback: search for first standard role group, else use other-tab
        if (standardRoleGroups.length > 0) {
          setActiveTrackId(standardRoleGroups[0].id);
        } else if (otherTracks.length > 0) {
          setActiveTrackId("other-tab");
          setSelectedOtherTrackId(otherTracks[0].id);
        }
      }
      setInitializedSongId(song.id);
      setLazyLoadedTrackId(null); // Reset lazy loaded indicator for the new song context
      lastPreferredRef.current = preferredInstrument;
    } else if (activeTrackId === "other-tab" && !selectedOtherTrackId && otherTracks.length > 0) {
      setSelectedOtherTrackId(otherTracks[0].id);
    }
  }, [song, activeTrackId, selectedOtherTrackId, initializedSongId, preferredInstrument]);

  // Trigger YouTube media lazy-load when active role group is standard and missing media links
  useEffect(() => {
    const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== "Other");
    const activeRoleGroup = standardRoleGroups.find((rg) => rg.id === activeTrackId);

    if (!activeRoleGroup || activeRoleGroup.role === "Other") return;

    const needsBacking = activeRoleGroup.backingTrackLink === null;
    const needsTabVideo = activeRoleGroup.tabVideoLink === null;

    if ((needsBacking || needsTabVideo) && activeRoleGroup.id !== lazyLoadedTrackId && !isLazyLoading && !loadingRef.current) {
      loadingRef.current = true;
      setIsLazyLoading(true);

      lazyLoadTrackMedia(activeRoleGroup.id)
        .then((res) => {
          loadingRef.current = false;
          if (!isMountedRef.current) return;
          setIsLazyLoading(false);
          setLazyLoadedTrackId(activeRoleGroup.id); // ALWAYS mark as attempted to prevent loop
          if (res.success) {
            onRefresh();
          }
        })
        .catch((err) => {
          loadingRef.current = false;
          console.error("Lazy loading track media failed:", err);
          if (isMountedRef.current) {
            setIsLazyLoading(false);
            setLazyLoadedTrackId(activeRoleGroup.id); // Also mark as attempted on failure
          }
        });
    }
  }, [song.roleGroups, activeTrackId, lazyLoadedTrackId, isLazyLoading, onRefresh]);

  // Pre-resolve lyrics link in the background if it's missing (e.g. for existing songs)
  useEffect(() => {
    if (song && !song.lyrics) {
      getGeniusLyricsLinkAction(song.id, song.artist, song.title)
        .then((resolvedUrl) => {
          if (resolvedUrl && resolvedUrl.startsWith("http") && isMountedRef.current) {
            onRefresh();
          }
        })
        .catch((err) => {
          console.error("Error pre-resolving lyrics link in background:", err);
        });
    }
  }, [song, onRefresh]);

  if (!song.roleGroups || song.roleGroups.length === 0) {
    return (
      <div className="text-center py-10 bg-[#161719] border border-[#27282b] rounded-2xl p-6 text-[#888d96]">
        <Music className="w-12 h-12 mx-auto mb-3 text-[#27282b] animate-pulse" />
        <h3 className="font-semibold text-lg text-[#f1f2f4]">No Tracks Found</h3>
        <p className="text-sm mt-1">This song doesn&apos;t have any notation or instrument tracks loaded.</p>
      </div>
    );
  }

  const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== "Other");
  const otherRoleGroup = song.roleGroups.find((rg) => rg.role === "Other");
  const otherTracks = otherRoleGroup?.tracks || [];

  async function handleSaveVideoLink(url: string | null) {
    if (!videoSelectorState) return;
    const { trackId, type } = videoSelectorState;
    const res = await updateTrackVideoLink(trackId, type, url);
    if (res.success) {
      onRefresh();
    }
  }

  return (
    <Card className="border-[#27282b] bg-[#161719] overflow-hidden rounded-2xl shadow-xl">
      <CardHeader className="border-b border-[#27282b] pb-5 pt-6 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {song.albumArt && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={song.albumArt}
              alt=""
              className="w-14 h-14 rounded-xl object-cover border border-[#27282b] flex-shrink-0"
            />
          )}
          <div>
            <span className="text-[10px] font-bold text-[#888d96] uppercase tracking-widest bg-[#27282b]/60 border border-[#3b3e45]/50 px-2.5 py-1 rounded-full">
              Song Details
            </span>
            <CardTitle className="text-2xl font-black text-[#f1f2f4] mt-2 flex items-center gap-2">
              {song.title}
            </CardTitle>
            <CardDescription className="text-[#888d96] text-xs mt-0.5 font-medium">
              by {song.artist}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-center">
          {onPractice && (
            <PracticeButton onClick={onPractice} />
          )}
          {onDelete && (
            <Button
              variant="destructive"
              size="icon"
              onClick={onDelete}
              className="bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 text-red-400 hover:text-[#f1f2f4] rounded-xl h-10 w-10 transition-all duration-200"
              title="Delete Song"
            >
              <Trash className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <Tabs value={activeTrackId} onValueChange={setActiveTrackId} className="w-full">
          {/* Scrollable tabs list for mobile */}
          <div className="overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
            <TabsList className="bg-[#0c0d0e] border border-[#27282b] p-1 rounded-xl h-auto flex w-max min-w-full">
              {standardRoleGroups.map((rg) => (
                <TabsTrigger
                  key={rg.id}
                  value={rg.id}
                  onClick={() => { saveUserSettings(rg.role); }}
                  className="px-4 py-2 text-xs font-bold rounded-xl data-[state=active]:bg-[#27282b] data-[state=active]:text-[#f1f2f4] text-[#888d96] border border-transparent data-[state=active]:border-[#3b3e45] hover:text-[#f1f2f4] transition-all cursor-pointer"
                >
                  {rg.role}
                </TabsTrigger>
              ))}

              {otherTracks.length > 0 && (
                <TabsTrigger
                  value="other-tab"
                  className="px-4 py-2 text-xs font-bold rounded-xl data-[state=active]:bg-[#27282b] data-[state=active]:text-[#f1f2f4] text-[#888d96] border border-transparent data-[state=active]:border-[#3b3e45] hover:text-[#f1f2f4] transition-all cursor-pointer"
                >
                  Other Instruments
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Standard Role Groups Content */}
          {standardRoleGroups.map((roleGroup) => {
            const backingVideoId = getYouTubeId(roleGroup.backingTrackLink);
            const tabVideoId = getYouTubeId(roleGroup.tabVideoLink);

            return (
              <TabsContent
                key={roleGroup.id}
                value={roleGroup.id}
                className="mt-6 space-y-6 focus-visible:ring-0 focus-visible:outline-none"
              >
                {/* Notation & Sheets Card */}
                <div className="bg-[#1d1f23] border border-[#2c313a] rounded-2xl p-5 space-y-4">
                  <div>
                    <h4 className="font-extrabold text-sm text-[#9ebbcf] flex items-center gap-1.5">
                      <Music className="w-4 h-4 text-[#888d96]" /> {
                        roleGroup.role === "Vocals" ? "Lyrics" : "Notation & Sheets"
                      }
                    </h4>
                    <p className="text-xs text-[#888d96] mt-1 font-medium">
                      {
                        roleGroup.role === "Vocals" 
                          ? "Select a vocalist track to open lyrics reference."
                          : "Select a track representation below to open notation."
                      }
                    </p>
                  </div>

                  <div className="space-y-3">
                    {roleGroup.tracks.map((track, idx) => {
                      const isMultiple = roleGroup.tracks.length > 1;
                      const isExpanded = !isMultiple || (isNotationExpanded[track.id] ?? (idx === 0));
                      const links = getAlternativeLinks(track.tabLink);
                      
                      return (
                        <div key={track.id} className="bg-[#0c0d0e]/60 border border-[#27282b] rounded-2xl overflow-hidden transition-all duration-200">
                          {isMultiple ? (
                            <button
                              type="button"
                              onClick={() =>
                                setIsNotationExpanded((prev) => ({
                                  ...prev,
                                  [track.id]: !isExpanded,
                                }))
                              }
                              className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#161719]/40 transition-colors cursor-pointer"
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-extrabold text-[#f1f2f4]">
                                  {track.instrumentName} {track.details ? `— ${track.details}` : ""}
                                </span>
                                <span className="text-[10px] text-[#888d96] font-medium">
                                  Track {idx + 1}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-3.5">
                                {(roleGroup.role === "Guitar" || roleGroup.role === "Bass") && (
                                  <div className="flex items-center gap-1.5 bg-[#161719] border border-[#27282b] px-2.5 py-1 rounded-lg">
                                    <span className="text-[9px] text-[#888d96] uppercase tracking-wider font-bold">Tuning:</span>
                                    <span className="text-xs font-mono font-bold text-[#b8c2d1] tracking-wide">{track.tuning}</span>
                                  </div>
                                )}
                                <ChevronDown className={cn("w-4 h-4 text-[#888d96] transition-transform duration-200", isExpanded && "rotate-180")} />
                              </div>
                            </button>
                          ) : (
                            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#27282b]/60">
                              <div>
                                <span className="text-xs font-extrabold text-[#f1f2f4]">
                                  {track.instrumentName} {track.details ? `— ${track.details}` : ""}
                                </span>
                              </div>
                              {(roleGroup.role === "Guitar" || roleGroup.role === "Bass") && (
                                <div className="flex items-center gap-1.5 bg-[#161719] border border-[#27282b] px-2.5 py-1 rounded-lg">
                                  <span className="text-[9px] text-[#888d96] uppercase tracking-wider font-bold">Tuning:</span>
                                  <span className="text-xs font-mono font-bold text-[#b8c2d1] tracking-wide">{track.tuning}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {isExpanded && (
                            <div className={cn("px-4 pb-4 space-y-3", !isMultiple && "pt-4")}>
                              {isMultiple && <div className="border-t border-[#27282b]/60 my-2" />}
                              <div className="flex flex-wrap gap-2.5 pt-1">
                                {roleGroup.role === "Guitar" || roleGroup.role === "Bass" ? (
                                  <>
                                    <a
                                      href={links.tab}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <Music className="w-3.5 h-3.5 text-[#5b80a5]" />
                                      Interactive Tab
                                      <ExternalLink className="w-3 h-3 text-[#888d96]" />
                                    </a>
                                    <a
                                      href={links.sheet}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-[#73a2cf]" />
                                      Sheet Music
                                      <ExternalLink className="w-3 h-3 text-[#888d96]" />
                                    </a>
                                    <a
                                      href={links.chords}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-[#1b2824] hover:bg-[#22352f] border border-[#2d473f] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-[#4ea388]" />
                                      Chords Sheet
                                      <ExternalLink className="w-3 h-3 text-[#888d96]" />
                                    </a>
                                  </>
                                ) : roleGroup.role === "Piano/Keyboard" ? (
                                  <>
                                    <a
                                      href={links.sheet}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-[#73a2cf]" />
                                      Sheet Music
                                      <ExternalLink className="w-3 h-3 text-[#888d96]" />
                                    </a>
                                    <a
                                      href={links.chords}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-[#1b2824] hover:bg-[#22352f] border border-[#2d473f] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-[#4ea388]" />
                                      Chords Sheet
                                      <ExternalLink className="w-3 h-3 text-[#888d96]" />
                                    </a>
                                  </>
                                ) : roleGroup.role === "Vocals" ? (
                                  <>
                                    <a
                                      href={song.lyrics || `https://genius.com/search?q=${encodeURIComponent(song.artist + " " + song.title)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-[#2d1b28] hover:bg-[#3a2233] border-[#4f2d47] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-[#cf73b5]" />
                                      Open Lyrics
                                      <ExternalLink className="w-3 h-3 text-[#888d96]" />
                                    </a>
                                    <a
                                      href={links.tab}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <Music className="w-3.5 h-3.5 text-[#5b80a5]" />
                                      Interactive Tab
                                      <ExternalLink className="w-3 h-3 text-[#888d96]" />
                                    </a>
                                  </>
                                ) : (
                                  <a
                                    href={links.tab}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      buttonVariants({ variant: "default", size: "sm" }),
                                      "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                    )}
                                  >
                                    <Music className="w-3.5 h-3.5 text-[#5b80a5]" />
                                    Interactive Tab
                                    <ExternalLink className="w-3 h-3 text-[#888d96]" />
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Backing Track & Video Lessons */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Backing Track Card */}
                  <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-[#27282b] flex items-center justify-between bg-[#161719]/20">
                      <span className="text-xs font-bold text-[#f1f2f4] flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-[#888d96]" /> {roleGroup.role === "Vocals" ? "Backing Track (Instrumental)" : "Backing Track"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVideoSelectorState({
                            isOpen: true,
                            trackId: roleGroup.id,
                            type: "backing",
                            instrumentName: roleGroup.role,
                            currentUrl: roleGroup.backingTrackLink === "none" ? null : roleGroup.backingTrackLink,
                          })
                        }
                        className="text-[10px] font-bold text-[#888d96] hover:text-[#f1f2f4] h-8 rounded-lg"
                      >
                        Change Video
                      </Button>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                      {isLazyLoading && roleGroup.backingTrackLink === null ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                          <p className="text-xs text-[#888d96]">Searching YouTube backing track...</p>
                        </div>
                      ) : (backingVideoId && roleGroup.backingTrackLink !== "none") ? (
                        <div className="w-full aspect-video rounded-xl overflow-hidden border border-[#27282b] bg-black">
                          <iframe
                            src={`https://www.youtube.com/embed/${backingVideoId}`}
                            title="Backing Track Player"
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-xs text-[#888d96] mb-4 font-medium">No backing track link found.</p>
                          <Button
                            onClick={() =>
                              setVideoSelectorState({
                                isOpen: true,
                                trackId: roleGroup.id,
                                type: "backing",
                                instrumentName: roleGroup.role,
                                currentUrl: roleGroup.backingTrackLink === "none" ? null : roleGroup.backingTrackLink,
                              })
                            }
                            className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] text-xs rounded-xl"
                          >
                            Search Backing Track
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tab/Reference Video Card */}
                  <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-[#27282b] flex items-center justify-between bg-[#161719]/20">
                      <span className="text-xs font-bold text-[#f1f2f4] flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-[#888d96]" /> {
                          roleGroup.role === "Vocals" 
                            ? "Original Song (Vocal Reference)" 
                            : roleGroup.role === "Piano/Keyboard" 
                            ? "Video Lesson / Cover" 
                            : "Tab Video Lesson"
                        }
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVideoSelectorState({
                            isOpen: true,
                            trackId: roleGroup.id,
                            type: "tab",
                            instrumentName: roleGroup.role,
                            currentUrl: roleGroup.tabVideoLink === "none" ? null : roleGroup.tabVideoLink,
                          })
                        }
                        className="text-[10px] font-bold text-[#888d96] hover:text-[#f1f2f4] h-8 rounded-lg"
                      >
                        Change Video
                      </Button>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                      {isLazyLoading && roleGroup.tabVideoLink === null ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                          <p className="text-xs text-[#888d96]">{roleGroup.role === "Vocals" ? "Searching original song..." : "Searching YouTube lesson..."}</p>
                        </div>
                      ) : (tabVideoId && roleGroup.tabVideoLink !== "none") ? (
                        <div className="w-full aspect-video rounded-xl overflow-hidden border border-[#27282b] bg-black">
                          <iframe
                            src={`https://www.youtube.com/embed/${tabVideoId}`}
                            title="Tab Video Player"
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-xs text-[#888d96] mb-4 font-medium">{roleGroup.role === "Vocals" ? "No video reference found." : "No video lesson or cover found."}</p>
                          <Button
                            onClick={() =>
                              setVideoSelectorState({
                                isOpen: true,
                                trackId: roleGroup.id,
                                type: "tab",
                                instrumentName: roleGroup.role,
                                currentUrl: roleGroup.tabVideoLink === "none" ? null : roleGroup.tabVideoLink,
                              })
                            }
                            className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] text-xs rounded-xl"
                          >
                            {
                              roleGroup.role === "Vocals" 
                                ? "Search Original Song" 
                                : roleGroup.role === "Piano/Keyboard" 
                                ? "Search Video Lesson" 
                                : "Search Tab Video"
                            }
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* PRACTICE PROGRESS/REHEARSAL LOG CARD */}
                <PracticeLogCard
                  songId={song.id}
                  initialStatus={initialProgress?.status}
                  initialNotes={initialProgress?.notes ?? ""}
                  initialSpeed={initialProgress?.speed}
                  onSaveSuccess={async () => {
                    const prog = await getSongProgress(song.id);
                    if (prog) {
                      setInitialProgress({ status: prog.status, speed: prog.speed, notes: prog.notes || "" });
                    }
                    onRefresh();
                  }}
                  className="mt-6 border-[#27282b]/60 bg-[#0c0d0e]/60"
                  showPrivateIndicator
                />
              </TabsContent>
            );
          })}

          {/* Grouped Other Tracks Content */}
          {otherTracks.length > 0 && (
            <TabsContent value="other-tab" className="mt-6 focus-visible:ring-0 focus-visible:outline-none">
              {(() => {
                const currentOtherTrack = otherTracks.find((t) => t.id === selectedOtherTrackId) || otherTracks[0];
                const links = getAlternativeLinks(currentOtherTrack.tabLink);

                return (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Left list of other instruments */}
                    <div className="md:col-span-1 space-y-2">
                      <span className="text-[10px] text-[#888d96] uppercase tracking-wider font-bold block mb-1">
                        Select Instrument
                      </span>
                      <div className="flex md:flex-col overflow-x-auto gap-2 pb-2 md:pb-0 scrollbar-none">
                        {otherTracks.map((track) => {
                          const isSelected = track.id === currentOtherTrack.id;
                          return (
                            <Button
                              key={track.id}
                              variant={isSelected ? "default" : "outline"}
                              onClick={() => setSelectedOtherTrackId(track.id)}
                              className={cn(
                                "rounded-xl justify-start text-xs font-bold w-full h-10 px-3 transition-all shrink-0 cursor-pointer",
                                isSelected
                                  ? "bg-[#27282b] text-[#f1f2f4] border border-[#3b3e45]"
                                  : "border-[#27282b] bg-[#0c0d0e]/40 text-[#888d96] hover:bg-[#27282b] hover:text-[#f1f2f4]"
                              )}
                            >
                              {track.instrumentName}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right details panel for the selected other instrument */}
                    <div className="md:col-span-3 space-y-6">
                      {/* Equipment / Role Info details */}
                      <div className="bg-[#0c0d0e] border border-[#27282b] rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <span className="text-[10px] text-[#888d96] uppercase tracking-wider font-bold block">Equipment / Role Info</span>
                          <span className="text-sm font-semibold text-[#f1f2f4] block mt-0.5 leading-relaxed whitespace-normal">
                            {currentOtherTrack.details || `Role: ${currentOtherTrack.role}`}
                          </span>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-[#161719] border border-[#27282b] flex items-center justify-center flex-shrink-0 ml-2">
                          <Info className="w-4 h-4 text-[#888d96]" />
                        </div>
                      </div>

                      {/* Notation Links */}
                      <div className="bg-[#1d1f23] border border-[#2c313a] rounded-2xl p-5 space-y-4">
                        <div>
                          <h4 className="font-extrabold text-sm text-[#9ebbcf] flex items-center gap-1.5">
                            <Music className="w-4 h-4 text-[#888d96]" /> Notation &amp; Sheets
                          </h4>
                          <p className="text-xs text-[#888d96] mt-1 font-medium">
                            Open the interactive sheet music or tab representation.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <a
                            href={links.tab}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              buttonVariants({ variant: "default", size: "default" }),
                              "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl shadow-md flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                            )}
                          >
                            <Music className="w-3.5 h-3.5 text-[#5b80a5]" />
                            Open Interactive Tab
                            <ExternalLink className="w-3 h-3 text-[#888d96]" />
                          </a>
                        </div>
                      </div>

                      {/* Other Notice */}
                      <div className="bg-[#0c0d0e] border border-[#27282b] rounded-2xl p-6 text-center text-[#888d96]">
                        <Info className="w-8 h-8 mx-auto mb-2 text-[#27282b]" />
                        <h5 className="font-semibold text-sm text-[#f1f2f4]">Non-Standard Instrument</h5>
                        <p className="text-xs mt-1">
                          Backing tracks and video lessons are not automated for non-standard instruments. Use the interactive notation tab above.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>

      {/* Video Selector Modal */}
      {videoSelectorState && (() => {
        const matchingGroup = song.roleGroups.find((rg) => rg.id === videoSelectorState.trackId);
        const role = matchingGroup ? matchingGroup.role : "Other";
        return (
          <VideoSelector
            isOpen={videoSelectorState.isOpen}
            onClose={() => setVideoSelectorState(null)}
            trackId={videoSelectorState.trackId}
            type={videoSelectorState.type}
            role={role}
            instrumentName={videoSelectorState.instrumentName}
            currentUrl={videoSelectorState.currentUrl}
            songTitle={song.title}
            songArtist={song.artist}
            onSave={handleSaveVideoLink}
          />
        );
      })()}
    </Card>
  );
}
