"use client";

import { useEffect } from "react";

/**
 * Return keyboard focus to the page after interacting with an embed. Focusing
 * a DOM element is necessary: iframe.blur() and window.focus() can leave the
 * iframe's browsing context receiving keys even after activeElement changes.
 */
export function blurActiveIframe() {
  const active = document.activeElement;
  // Don't pull focus back when the user switches tabs, windows, or apps.
  if (active?.tagName !== "IFRAME" || !document.hasFocus()) return;

  const body = document.body;
  const tabIndex = body.getAttribute("tabindex");
  if (tabIndex === null) body.setAttribute("tabindex", "-1");
  body.focus({ preventScroll: true });
  if (tabIndex === null) body.removeAttribute("tabindex");
}

/**
 * Cross-origin iframe key events never reach the page's keyboard listener.
 * Check focus each frame as well as after window blur: browsers can update
 * activeElement late or refocus an embed without another window blur event.
 */
export function useIframeFocusGuard() {
  useEffect(() => {
    let animationFrame: number;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const checkFocus = () => {
      blurActiveIframe();
      animationFrame = requestAnimationFrame(checkFocus);
    };

    const handleBlur = () => {
      clearTimeout(timeout);
      // Wait until the browser finishes moving focus into the iframe.
      timeout = setTimeout(blurActiveIframe, 0);
    };

    animationFrame = requestAnimationFrame(checkFocus);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("blur", handleBlur);
      cancelAnimationFrame(animationFrame);
      clearTimeout(timeout);
    };
  }, []);
}
