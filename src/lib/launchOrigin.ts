// src/lib/launchOrigin.ts
export type LaunchOrigin = 'computer' | 'mobile';

interface NavLike {
  userAgentData?: { mobile?: boolean };
  userAgent?: string;
}

/**
 * Decide computer vs mobile for launch routing.
 * Prefer the real device signal (navigator.userAgentData.mobile, Chromium);
 * fall back to a UA-string check for Safari/Firefox where userAgentData is absent.
 * NOTE: do NOT use useIsMobile() here — that's viewport width, which is unreliable
 * (a narrow desktop window reads as "mobile").
 */
export function detectOrigin(nav: NavLike = navigator): LaunchOrigin {
  if (nav.userAgentData && typeof nav.userAgentData.mobile === 'boolean') {
    return nav.userAgentData.mobile ? 'mobile' : 'computer';
  }
  const ua = nav.userAgent ?? '';
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) ? 'mobile' : 'computer';
}
