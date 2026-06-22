"use client";

import { useEffect, useState, createContext, useContext } from "react";

const AnonymousUserContext = createContext<string | null>(null);

export function useAnonymousUser() {
  return useContext(AnonymousUserContext);
}

function generateUUID() {
  if (typeof window !== "undefined") {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    // Fallback for insecure contexts (e.g., local IP address testing over HTTP)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return "";
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

export function AnonymousUserProvider({ children }: { children: React.ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const storedUid = localStorage.getItem("band_orchestrator_uid");
    const cookieUid = getCookie("band_orchestrator_uid");

    let finalUid = storedUid || cookieUid;
    let shouldReload = false;

    if (!finalUid) {
      finalUid = generateUUID();
      shouldReload = true;
    }

    if (storedUid !== finalUid) {
      localStorage.setItem("band_orchestrator_uid", finalUid);
    }

    if (cookieUid !== finalUid) {
      document.cookie = `band_orchestrator_uid=${finalUid}; path=/; max-age=${60 * 60 * 24 * 365 * 10}; SameSite=Lax`;
      if (!cookieUid) {
        shouldReload = true;
      }
    }

    setUid(finalUid);

    if (shouldReload) {
      window.location.reload();
    }
  }, []);

  return (
    <AnonymousUserContext.Provider value={uid}>
      {children}
    </AnonymousUserContext.Provider>
  );
}
