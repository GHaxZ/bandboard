"use client";

import { useState, useEffect, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateTrackVideoLink, lazyLoadTrackMedia } from "@/app/actions/songs";
import { VideoSelector } from "./VideoSelector";
import { Music, Play, Video, ExternalLink, Sliders, Info, Trash, FileText, Loader2 } from "lucide-react";

interface Track {
  id: string;
  songId: string;
  instrumentName: string;
  role: string;
  details: string | null;
  tuning: string;
  tabLink: string;
  backingTrackLink: string | null;
  tabVideoLink: string | null;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  songsterrId: number | null;
  albumArt: string | null;
  lyrics?: string | null;
  createdAt: number;
  tracks: Track[];
}

interface SongDashboardProps {
  song: Song;
  onRefresh: () => void;
  onDelete?: () => void;
}

function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match ? match[1] : null;
}

export function SongDashboard({ song, onRefresh, onDelete }: SongDashboardProps) {
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

  // Helper to generate alternate representation links from Songsterr URL
  function getAlternativeLinks(tabLink: string) {
    if (!tabLink || !tabLink.includes("-tab-s")) {
      return {
        tab: tabLink,
        sheet: tabLink,
        chords: tabLink,
      };
    }
    const sheet = tabLink.replace("-tab-s", "-sheet-s");
    const chords = tabLink.replace(/-tab-s(\d+)(t\d+)?/, "-chords-s$1");
    return {
      tab: tabLink,
      sheet,
      chords,
    };
  }

  // Smart initialization: select the track that matches the user's preferred instrument/role
  useEffect(() => {
    const otherTracks = song.tracks.filter((t) => t.role === "Other");
    const isStandardValid = song.tracks.some((t) => t.role !== "Other" && t.id === activeTrackId);
    const isOtherTabActive = activeTrackId === "other-tab" && otherTracks.length > 0;
    
    if ((!isStandardValid && !isOtherTabActive) || song.id !== initializedSongId) {
      const preferredRole = localStorage.getItem("bandboard_instrument") || "Guitar";
      
      // Try to find a track matching the preferred role
      const matchingTrack = song.tracks.find(
        (t) => t.role.toLowerCase() === preferredRole.toLowerCase()
      );

      if (matchingTrack) {
        if (matchingTrack.role === "Other") {
          setActiveTrackId("other-tab");
          setSelectedOtherTrackId(matchingTrack.id);
        } else {
          setActiveTrackId(matchingTrack.id);
        }
      } else {
        // Fallback: search for first standard track, else use other-tab
        const firstStandard = song.tracks.find((t) => t.role !== "Other");
        if (firstStandard) {
          setActiveTrackId(firstStandard.id);
        } else if (song.tracks.length > 0) {
          setActiveTrackId("other-tab");
          setSelectedOtherTrackId(song.tracks[0].id);
        }
      }
      setInitializedSongId(song.id);
      setLazyLoadedTrackId(null); // Reset lazy loaded indicator for the new song context
    } else if (activeTrackId === "other-tab" && !selectedOtherTrackId && otherTracks.length > 0) {
      // If other-tab was clicked but no sub-instrument selected, auto-select first one
      setSelectedOtherTrackId(otherTracks[0].id);
    }
  }, [song, activeTrackId, selectedOtherTrackId, initializedSongId]);

  // Trigger YouTube media lazy-load when active track is standard and missing media links
  useEffect(() => {
    const standardTracks = song.tracks.filter((t) => t.role !== "Other");
    const otherTracks = song.tracks.filter((t) => t.role === "Other");

    const activeTrack = activeTrackId === "other-tab"
      ? (song.tracks.find((t) => t.id === selectedOtherTrackId) || otherTracks[0])
      : (song.tracks.find((t) => t.id === activeTrackId) || song.tracks[0]);

    if (!activeTrack || activeTrack.role === "Other") return;

    const needsBacking = activeTrack.backingTrackLink === null;
    const needsTabVideo = activeTrack.tabVideoLink === null;

    if ((needsBacking || needsTabVideo) && activeTrack.id !== lazyLoadedTrackId && !isLazyLoading && !loadingRef.current) {
      loadingRef.current = true;
      setIsLazyLoading(true);

      lazyLoadTrackMedia(activeTrack.id)
        .then((res) => {
          loadingRef.current = false;
          if (!isMountedRef.current) return;
          setIsLazyLoading(false);
          setLazyLoadedTrackId(activeTrack.id); // ALWAYS mark as attempted to prevent loop
          if (res.success) {
            onRefresh();
          }
        })
        .catch((err) => {
          loadingRef.current = false;
          console.error("Lazy loading track media failed:", err);
          if (isMountedRef.current) {
            setIsLazyLoading(false);
            setLazyLoadedTrackId(activeTrack.id); // Also mark as attempted on failure
          }
        });
    }
  }, [song.tracks, activeTrackId, selectedOtherTrackId, lazyLoadedTrackId, isLazyLoading, onRefresh]);

  if (!song.tracks || song.tracks.length === 0) {
    return (
      <div className="text-center py-10 bg-[#161719] border border-[#27282b] rounded-2xl p-6 text-[#888d96]">
        <Music className="w-12 h-12 mx-auto mb-3 text-[#27282b] animate-pulse" />
        <h3 className="font-semibold text-lg text-[#f1f2f4]">No Tracks Found</h3>
        <p className="text-sm mt-1">This song doesn&apos;t have any notation or instrument tracks loaded.</p>
      </div>
    );
  }

  const standardTracks = song.tracks.filter((t) => t.role !== "Other");
  const otherTracks = song.tracks.filter((t) => t.role === "Other");

  const activeTrack = activeTrackId === "other-tab"
    ? (song.tracks.find((t) => t.id === selectedOtherTrackId) || otherTracks[0])
    : (song.tracks.find((t) => t.id === activeTrackId) || song.tracks[0]);

  const backingVideoId = getYouTubeId(activeTrack?.backingTrackLink);
  const tabVideoId = getYouTubeId(activeTrack?.tabVideoLink);

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
              {standardTracks.map((track) => (
                <TabsTrigger
                  key={track.id}
                  value={track.id}
                  className="rounded-lg py-2 px-4 text-xs font-bold text-[#888d96] data-[state=active]:bg-[#27282b] data-[state=active]:text-[#f1f2f4] transition-all duration-200"
                >
                  {track.instrumentName}
                </TabsTrigger>
              ))}
              {otherTracks.length > 0 && (
                <TabsTrigger
                  value="other-tab"
                  className="rounded-lg py-2 px-4 text-xs font-bold text-[#888d96] data-[state=active]:bg-[#27282b] data-[state=active]:text-[#f1f2f4] transition-all duration-200"
                >
                  Other Instruments
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Standard Tracks Content */}
          {standardTracks.map((track) => {
            const backingVideoId = getYouTubeId(track.backingTrackLink);
            const tabVideoId = getYouTubeId(track.tabVideoLink);

            return (
              <TabsContent
                key={track.id}
                value={track.id}
                className="mt-6 space-y-6 focus-visible:ring-0 focus-visible:outline-none"
              >
                 {/* Top Stats: Tuning & Gear Details */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {(track.role === "Guitar" || track.role === "Bass") && (
                     <div className="bg-[#0c0d0e] border border-[#27282b] rounded-2xl p-4 flex items-center justify-between">
                       <div>
                         <span className="text-[10px] text-[#888d96] uppercase tracking-wider font-bold block">Tuning</span>
                         <span className="text-lg font-mono font-extrabold text-[#f1f2f4] tracking-wider">
                           {track.tuning}
                         </span>
                       </div>
                       <div className="h-10 w-10 rounded-xl bg-[#161719] border border-[#27282b] flex items-center justify-center">
                         <Sliders className="w-4 h-4 text-[#888d96]" />
                       </div>
                     </div>
                   )}
 
                   <div className={cn(
                     "bg-[#0c0d0e] border border-[#27282b] rounded-2xl p-4 flex items-center justify-between",
                     (track.role !== "Guitar" && track.role !== "Bass") && "md:col-span-2"
                   )}>
                     <div className="flex-1">
                       <span className="text-[10px] text-[#888d96] uppercase tracking-wider font-bold block">Equipment / Role Info</span>
                       <span className="text-sm font-semibold text-[#f1f2f4] block mt-0.5 leading-relaxed whitespace-normal">
                         {track.details || `Role: ${track.role}`}
                       </span>
                     </div>
                     <div className="h-10 w-10 rounded-xl bg-[#161719] border border-[#27282b] flex items-center justify-center flex-shrink-0 ml-2">
                       <Info className="w-4 h-4 text-[#888d96]" />
                     </div>
                   </div>
                 </div>

                {/* Notation Deep Link Card */}
                <div className="bg-[#1d1f23] border border-[#2c313a] rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-extrabold text-sm text-[#9ebbcf] flex items-center gap-1.5">
                        <Music className="w-4 h-4 text-[#888d96]" /> Songsterr Notation &amp; Sheets
                      </h4>
                      <p className="text-xs text-[#888d96] mt-1 font-medium">
                        Select a representation format to view the interactive notations on Songsterr.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {(() => {
                      const links = getAlternativeLinks(track.tabLink);
                      const role = track.role;

                      if (role === "Guitar" || role === "Bass") {
                        return (
                          <>
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
                            <a
                              href={links.sheet}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "default", size: "default" }),
                                "bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#f1f2f4] rounded-xl shadow-md flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                              )}
                            >
                              <FileText className="w-3.5 h-3.5 text-[#73a2cf]" />
                              Open Sheet Music
                              <ExternalLink className="w-3 h-3 text-[#888d96]" />
                            </a>
                            <a
                              href={links.chords}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "default", size: "default" }),
                                "bg-[#1b2824] hover:bg-[#22352f] border border-[#2d473f] text-[#f1f2f4] rounded-xl shadow-md flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                              )}
                            >
                              <FileText className="w-3.5 h-3.5 text-[#4ea388]" />
                              Open Chords Sheet
                              <ExternalLink className="w-3 h-3 text-[#888d96]" />
                            </a>
                          </>
                        );
                      } else if (role === "Piano/Keyboard") {
                        return (
                          <>
                            <a
                              href={links.sheet}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "default", size: "default" }),
                                "bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#f1f2f4] rounded-xl shadow-md flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                              )}
                            >
                              <FileText className="w-3.5 h-3.5 text-[#73a2cf]" />
                              Open Sheet Music
                              <ExternalLink className="w-3 h-3 text-[#888d96]" />
                            </a>
                            <a
                              href={links.chords}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "default", size: "default" }),
                                "bg-[#1b2824] hover:bg-[#22352f] border border-[#2d473f] text-[#f1f2f4] rounded-xl shadow-md flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                              )}
                            >
                              <FileText className="w-3.5 h-3.5 text-[#4ea388]" />
                              Open Chords Sheet
                              <ExternalLink className="w-3 h-3 text-[#888d96]" />
                            </a>
                          </>
                        );
                      } else if (role === "Vocals") {
                        const geniusLink = `https://genius.com/search?q=${encodeURIComponent(song.artist + " " + song.title)}`;
                        return (
                          <a
                            href={geniusLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              buttonVariants({ variant: "default", size: "default" }),
                              "bg-[#2d1b28] hover:bg-[#3a2233] border-[#4f2d47] text-[#f1f2f4] rounded-xl shadow-md flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                            )}
                          >
                            <FileText className="w-3.5 h-3.5 text-[#cf73b5]" />
                            Open Lyrics (Genius)
                            <ExternalLink className="w-3 h-3 text-[#888d96]" />
                          </a>
                        );
                      } else {
                        // Drums / Other
                        return (
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
                        );
                      }
                    })()}
                  </div>
                </div>

                {/* Backing Track & Video Lessons */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Backing Track Card */}
                  <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-[#27282b] flex items-center justify-between bg-[#161719]/20">
                      <span className="text-xs font-bold text-[#f1f2f4] flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-[#888d96]" /> {track.role === "Vocals" ? "Backing Track (Instrumental)" : "Backing Track"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVideoSelectorState({
                            isOpen: true,
                            trackId: track.id,
                            type: "backing",
                            instrumentName: track.instrumentName,
                            currentUrl: track.backingTrackLink === "none" ? null : track.backingTrackLink,
                          })
                        }
                        className="text-[10px] font-bold text-[#888d96] hover:text-[#f1f2f4] h-8 rounded-lg"
                      >
                        Change Video
                      </Button>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                      {isLazyLoading && track.backingTrackLink === null ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                          <p className="text-xs text-[#888d96]">Searching YouTube backing track...</p>
                        </div>
                      ) : (backingVideoId && track.backingTrackLink !== "none") ? (
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
                                trackId: track.id,
                                type: "backing",
                                instrumentName: track.instrumentName,
                                currentUrl: track.backingTrackLink === "none" ? null : track.backingTrackLink,
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
                          track.role === "Vocals" 
                            ? "Original Song (Vocal Reference)" 
                            : track.role === "Piano/Keyboard" 
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
                            trackId: track.id,
                            type: "tab",
                            instrumentName: track.instrumentName,
                            currentUrl: track.tabVideoLink === "none" ? null : track.tabVideoLink,
                          })
                        }
                        className="text-[10px] font-bold text-[#888d96] hover:text-[#f1f2f4] h-8 rounded-lg"
                      >
                        Change Video
                      </Button>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                      {isLazyLoading && track.tabVideoLink === null ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                          <p className="text-xs text-[#888d96]">{track.role === "Vocals" ? "Searching original song..." : "Searching YouTube lesson..."}</p>
                        </div>
                      ) : (tabVideoId && track.tabVideoLink !== "none") ? (
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
                          <p className="text-xs text-[#888d96] mb-4 font-medium">{track.role === "Vocals" ? "No video reference found." : "No video lesson or cover found."}</p>
                          <Button
                            onClick={() =>
                              setVideoSelectorState({
                                isOpen: true,
                                trackId: track.id,
                                type: "tab",
                                instrumentName: track.instrumentName,
                                currentUrl: track.tabVideoLink === "none" ? null : track.tabVideoLink,
                              })
                            }
                            className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] text-xs rounded-xl"
                          >
                            {
                              track.role === "Vocals" 
                                ? "Search Original Song" 
                                : track.role === "Piano/Keyboard" 
                                ? "Search Video Lesson" 
                                : "Search Tab Video"
                            }
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
                            <Music className="w-4 h-4 text-[#888d96]" /> Songsterr Notation &amp; Sheets
                          </h4>
                          <p className="text-xs text-[#888d96] mt-1 font-medium">
                            Open the interactive sheet music or tab representation on Songsterr.
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
        const matchingTrack = song.tracks.find((t) => t.id === videoSelectorState.trackId);
        const role = matchingTrack ? matchingTrack.role : "Other";
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
