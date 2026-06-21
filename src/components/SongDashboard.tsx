"use client";

import { useState, useEffect } from "react";
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

  // Smart initialization: select the track that matches the user's preferred instrument/role ONLY when active track becomes invalid or song changes
  useEffect(() => {
    const hasActiveTrack = song.tracks.some((t) => t.id === activeTrackId);
    if (!hasActiveTrack || song.id !== initializedSongId) {
      const preferredRole = localStorage.getItem("bandboard_instrument") || "Guitar";
      
      // Try to find a track matching the preferred role
      const matchingTrack = song.tracks.find(
        (t) => t.role.toLowerCase() === preferredRole.toLowerCase()
      );

      if (matchingTrack) {
        setActiveTrackId(matchingTrack.id);
      } else {
        // Fallback to first track
        setActiveTrackId(song.tracks[0].id);
      }
      setInitializedSongId(song.id);
      setLazyLoadedTrackId(null); // Reset lazy loaded indicator for the new song context
    }
  }, [song, activeTrackId, initializedSongId]);

  // Trigger YouTube media lazy-load when active track is standard and missing media links
  useEffect(() => {
    const activeTrack = song.tracks.find((t) => t.id === activeTrackId);
    if (!activeTrack || activeTrack.role === "Other") return;

    const needsBacking = !activeTrack.backingTrackLink;
    const needsTabVideo = !activeTrack.tabVideoLink;

    if ((needsBacking || needsTabVideo) && activeTrack.id !== lazyLoadedTrackId && !isLazyLoading) {
      let isSubscribed = true;
      setIsLazyLoading(true);

      lazyLoadTrackMedia(activeTrack.id)
        .then((res) => {
          if (!isSubscribed) return;
          setIsLazyLoading(false);
          if (res.success) {
            setLazyLoadedTrackId(activeTrack.id);
            onRefresh();
          }
        })
        .catch((err) => {
          console.error("Lazy loading track media failed:", err);
          if (isSubscribed) {
            setIsLazyLoading(false);
          }
        });

      return () => {
        isSubscribed = false;
      };
    }
  }, [song.tracks, activeTrackId, lazyLoadedTrackId, isLazyLoading, onRefresh]);

  if (!song.tracks || song.tracks.length === 0) {
    return (
      <div className="text-center py-10 bg-[#161719] border border-[#27282b] rounded-2xl p-6 text-[#888d96]">
        <Music className="w-12 h-12 mx-auto mb-3 text-[#27282b] animate-pulse" />
        <h3 className="font-semibold text-lg text-[#f1f2f4]">No Tracks Found</h3>
        <p className="text-sm mt-1">This song doesn&apos;t have any notation or instrument tracks loaded.</p>
      </div>
    );
  }

  const activeTrack = song.tracks.find((t) => t.id === activeTrackId) || song.tracks[0];
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
              {song.tracks.map((track) => (
                <TabsTrigger
                  key={track.id}
                  value={track.id}
                  className="rounded-lg py-2 px-4 text-xs font-bold text-[#888d96] data-[state=active]:bg-[#27282b] data-[state=active]:text-[#f1f2f4] transition-all duration-200"
                >
                  {track.instrumentName}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Active Tab Content */}
          <TabsContent value={activeTrack.id} className="mt-6 space-y-6 focus-visible:ring-0 focus-visible:outline-none">
            {/* Top Stats: Tuning & Gear Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0c0d0e] border border-[#27282b] rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#888d96] uppercase tracking-wider font-bold block">Tuning</span>
                  <span className="text-lg font-mono font-extrabold text-[#f1f2f4] tracking-wider">
                    {activeTrack.tuning}
                  </span>
                </div>
                <div className="h-10 w-10 rounded-xl bg-[#161719] border border-[#27282b] flex items-center justify-center">
                  <Sliders className="w-4 h-4 text-[#888d96]" />
                </div>
              </div>

              <div className="bg-[#0c0d0e] border border-[#27282b] rounded-2xl p-4 flex items-center justify-between">
                <div className="flex-1">
                  <span className="text-[10px] text-[#888d96] uppercase tracking-wider font-bold block">Equipment / Role Info</span>
                  <span className="text-sm font-semibold text-[#f1f2f4] block mt-0.5 leading-relaxed whitespace-normal">
                    {activeTrack.details || `Role: ${activeTrack.role}`}
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
                    <Music className="w-4 h-4 text-[#888d96]" /> Songsterr Notation & Sheets
                  </h4>
                  <p className="text-xs text-[#888d96] mt-1 font-medium">
                    Select a representation format to view the interactive notations on Songsterr.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {(() => {
                  const links = getAlternativeLinks(activeTrack.tabLink);
                  const role = activeTrack.role;

                  if (role === "Guitar" || role === "Bass" || role === "Keyboard") {
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
                  } else if (role === "Vocals") {
                    return (
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
                        Open Lyrics &amp; Chords
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

            {/* Backing Track, Tab Video & Lyrics Sections */}
            {(() => {
              if (activeTrack.role === "Other") {
                return (
                  <div className="bg-[#0c0d0e] border border-[#27282b] rounded-2xl p-6 text-center text-[#888d96]">
                    <Info className="w-8 h-8 mx-auto mb-2 text-[#27282b]" />
                    <h5 className="font-semibold text-sm text-[#f1f2f4]">Non-Standard Instrument</h5>
                    <p className="text-xs mt-1">
                      Backing tracks and video lessons are not automated for non-standard instruments. Use the interactive notation tab above.
                    </p>
                  </div>
                );
              }

              if (activeTrack.role === "Vocals" && song.lyrics) {
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Lyrics Column */}
                    <div className="lg:col-span-7 flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden shadow-lg">
                      <div className="p-4 border-b border-[#27282b] flex items-center justify-between bg-[#161719]/20">
                        <span className="text-xs font-bold text-[#f1f2f4] flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-[#5b80a5]" /> Lyrics
                        </span>
                      </div>
                      <div className="flex-1 p-5 overflow-y-auto max-h-[500px] font-mono text-[#f1f2f4] leading-relaxed whitespace-pre-wrap text-sm select-text scrollbar-thin scrollbar-thumb-[#27282b] scrollbar-track-[#0c0d0e] text-center">
                        {song.lyrics}
                      </div>
                    </div>

                    {/* Players Column */}
                    <div className="lg:col-span-5 space-y-6">
                      {/* Backing Track (Instrumental) */}
                      <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden shadow-lg">
                        <div className="p-4 border-b border-[#27282b] flex items-center justify-between bg-[#161719]/20">
                          <span className="text-xs font-bold text-[#f1f2f4] flex items-center gap-1.5">
                            <Play className="w-3.5 h-3.5 text-[#888d96]" /> Backing Track (Instrumental)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setVideoSelectorState({
                                isOpen: true,
                                trackId: activeTrack.id,
                                type: "backing",
                                instrumentName: activeTrack.instrumentName,
                                currentUrl: activeTrack.backingTrackLink,
                              })
                            }
                            className="text-[10px] font-bold text-[#888d96] hover:text-[#f1f2f4] h-8 rounded-lg"
                          >
                            Change Video
                          </Button>
                        </div>
                        <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                          {isLazyLoading && !activeTrack.backingTrackLink ? (
                            <div className="flex flex-col items-center justify-center py-8">
                              <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                              <p className="text-xs text-[#888d96]">Searching YouTube backing track...</p>
                            </div>
                          ) : backingVideoId ? (
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
                                    trackId: activeTrack.id,
                                    type: "backing",
                                    instrumentName: activeTrack.instrumentName,
                                    currentUrl: activeTrack.backingTrackLink,
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

                      {/* Original Song (Vocal Reference) */}
                      <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden shadow-lg">
                        <div className="p-4 border-b border-[#27282b] flex items-center justify-between bg-[#161719]/20">
                          <span className="text-xs font-bold text-[#f1f2f4] flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5 text-[#888d96]" /> Original Song (Vocal Reference)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setVideoSelectorState({
                                isOpen: true,
                                trackId: activeTrack.id,
                                type: "tab",
                                instrumentName: activeTrack.instrumentName,
                                currentUrl: activeTrack.tabVideoLink,
                              })
                            }
                            className="text-[10px] font-bold text-[#888d96] hover:text-[#f1f2f4] h-8 rounded-lg"
                          >
                            Change Video
                          </Button>
                        </div>
                        <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                          {isLazyLoading && !activeTrack.tabVideoLink ? (
                            <div className="flex flex-col items-center justify-center py-8">
                              <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                              <p className="text-xs text-[#888d96]">Searching YouTube lesson...</p>
                            </div>
                          ) : tabVideoId ? (
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
                              <p className="text-xs text-[#888d96] mb-4 font-medium">No video lesson or cover found.</p>
                              <Button
                                onClick={() =>
                                  setVideoSelectorState({
                                    isOpen: true,
                                    trackId: activeTrack.id,
                                    type: "tab",
                                    instrumentName: activeTrack.instrumentName,
                                    currentUrl: activeTrack.tabVideoLink,
                                  })
                                }
                                className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] text-xs rounded-xl"
                              >
                                Search Tab Video
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Standard layout for Guitar, Bass, Drums, Keyboard, or Vocals without lyrics
              return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Backing Track Card */}
                  <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-[#27282b] flex items-center justify-between bg-[#161719]/20">
                      <span className="text-xs font-bold text-[#f1f2f4] flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-[#888d96]" /> Backing Track
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVideoSelectorState({
                            isOpen: true,
                            trackId: activeTrack.id,
                            type: "backing",
                            instrumentName: activeTrack.instrumentName,
                            currentUrl: activeTrack.backingTrackLink,
                          })
                        }
                        className="text-[10px] font-bold text-[#888d96] hover:text-[#f1f2f4] h-8 rounded-lg"
                      >
                        Change Video
                      </Button>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                      {isLazyLoading && !activeTrack.backingTrackLink ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                          <p className="text-xs text-[#888d96]">Searching YouTube backing track...</p>
                        </div>
                      ) : backingVideoId ? (
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
                                trackId: activeTrack.id,
                                type: "backing",
                                instrumentName: activeTrack.instrumentName,
                                currentUrl: activeTrack.backingTrackLink,
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

                  {/* Tab Video Card */}
                  <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-[#27282b] flex items-center justify-between bg-[#161719]/20">
                      <span className="text-xs font-bold text-[#f1f2f4] flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-[#888d96]" /> Tab Video Lesson
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVideoSelectorState({
                            isOpen: true,
                            trackId: activeTrack.id,
                            type: "tab",
                            instrumentName: activeTrack.instrumentName,
                            currentUrl: activeTrack.tabVideoLink,
                          })
                        }
                        className="text-[10px] font-bold text-[#888d96] hover:text-[#f1f2f4] h-8 rounded-lg"
                      >
                        Change Video
                      </Button>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                      {isLazyLoading && !activeTrack.tabVideoLink ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                          <p className="text-xs text-[#888d96]">Searching YouTube lesson...</p>
                        </div>
                      ) : tabVideoId ? (
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
                          <p className="text-xs text-[#888d96] mb-4 font-medium">No video lesson or cover found.</p>
                          <Button
                            onClick={() =>
                              setVideoSelectorState({
                                isOpen: true,
                                trackId: activeTrack.id,
                                type: "tab",
                                instrumentName: activeTrack.instrumentName,
                                currentUrl: activeTrack.tabVideoLink,
                              })
                            }
                            className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] text-xs rounded-xl"
                          >
                            Search Tab Video
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Video Selector Modal */}
      {videoSelectorState && (
        <VideoSelector
          isOpen={videoSelectorState.isOpen}
          onClose={() => setVideoSelectorState(null)}
          trackId={videoSelectorState.trackId}
          type={videoSelectorState.type}
          instrumentName={videoSelectorState.instrumentName}
          currentUrl={videoSelectorState.currentUrl}
          songTitle={song.title}
          songArtist={song.artist}
          onSave={handleSaveVideoLink}
        />
      )}
    </Card>
  );
}
