"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateTrackVideoLink } from "@/app/actions/songs";
import { VideoSelector } from "./VideoSelector";
import { Music, Play, Video, ExternalLink, Sliders, Info, Trash } from "lucide-react";

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

  // Smart initialization: select the track that matches the user's preferred instrument/role ONLY once when the song ID changes
  useEffect(() => {
    if (song.tracks && song.tracks.length > 0 && song.id !== initializedSongId) {
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
    }
  }, [song, initializedSongId]);

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

            {/* Notation Deep Link */}
            <div className="bg-[#1d1f23] border border-[#2c313a] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="font-extrabold text-sm text-[#9ebbcf] flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-[#888d96]" /> Songsterr Interactive Notation
                </h4>
                <p className="text-xs text-[#888d96] mt-1 font-medium">
                  Open Songsterr interactive tabs for the exact notation, speeds, and looping.
                </p>
              </div>
              <a
                href={activeTrack.tabLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "default", size: "default" }),
                  "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl shadow-md shrink-0 flex items-center gap-1.5"
                )}
              >
                Open Tab Notation <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Backing Track & Tab Video Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Backing Track Card */}
              <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-[#27282b] flex items-center justify-between">
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
                  {backingVideoId ? (
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
              <div className="flex flex-col bg-[#0c0d0e] border border-[#27282b] rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-[#27282b] flex items-center justify-between">
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
                  {tabVideoId ? (
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
