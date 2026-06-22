"use client";

import { useEffect, useState, createContext, useContext } from "react";

const AnonymousUserContext = createContext<string | null>(null);

export function useAnonymousUser() {
  return useContext(AnonymousUserContext);
}

function generateUUID() {
  if (typeof window !== "undefined") {
    return window.crypto.randomUUID();
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
