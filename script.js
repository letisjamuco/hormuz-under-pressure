/* ---------------------------------------------------------------------
   FROM HORMUZ TO THE BOARDING GATE
   The plane moves continuously: its position interpolates smoothly between
   nav anchors based on scroll position within each section.
   --------------------------------------------------------------------- */

(() => {
  'use strict';

  const plane = document.querySelector('.nav__plane');
  const track = document.querySelector('.nav__progress-track');
  const brandLink = document.querySelector('.nav__brand');
  const menuLinks = Array.from(document.querySelectorAll('.nav__menu a'));

  // Build ordered list of anchors. Brand counts as anchor 0 (#hero).
  const anchors = [];
  if (brandLink) {
    const heroSection = document.querySelector('#hero');
    if (heroSection) anchors.push({ link: brandLink, section: heroSection });
  }
  menuLinks.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    const section = document.querySelector(href);
    if (!section) return;
    anchors.push({ link, section });
  });

  if (!plane || !track || anchors.length === 0) return;

  // Cache the X-coordinate (relative to the track) of each anchor link.
  // Recomputed on resize.
  let anchorPositions = [];
  let trackWidth = 0;

  const measureAnchors = () => {
    const trackRect = track.getBoundingClientRect();
    trackWidth = trackRect.width;
    anchorPositions = anchors.map(({ link }) => {
      const linkRect = link.getBoundingClientRect();
      const linkCenter = linkRect.left + linkRect.width / 2;
      return linkCenter - trackRect.left - 10; // 10 = half plane width
    });
  };

  // Cache section scroll boundaries.
  // For section i, we use:
  //   start = top of section i, in document coordinates
  //   end   = top of section i+1 (or doc bottom for last anchor)
  let sectionRanges = [];

  const measureSections = () => {
    const scrollY = window.scrollY || window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight;

    sectionRanges = anchors.map((a, i) => {
      const rect = a.section.getBoundingClientRect();
      const top = rect.top + scrollY;
      let end;
      if (i < anchors.length - 1) {
        const nextRect = anchors[i + 1].section.getBoundingClientRect();
        end = nextRect.top + scrollY;
      } else {
        // Last section: extends to bottom of doc
        end = docHeight;
      }
      return { start: top, end };
    });
  };

  const setActiveLink = (activeIdx) => {
    [brandLink, ...menuLinks].forEach((l) => {
      if (!l) return;
      const i = anchors.findIndex((a) => a.link === l);
      if (i === activeIdx) {
        l.style.opacity = '1';
        if (l !== brandLink) l.style.color = 'var(--accent-orange)';
      } else {
        l.style.opacity = '';
        if (l !== brandLink) l.style.color = '';
      }
    });
  };

  let lastActive = -1;

  // Smooth easing for the per-section progress so that motion feels less linear.
  // We keep it close to linear; just gentle ease-in-out at the edges.
  const ease = (t) => {
    // smoothstep-ish, but mild
    return t * t * (3 - 2 * t);
  };

  const updatePlanePosition = () => {
    if (anchorPositions.length === 0) return;

    const scrollY = window.scrollY || window.pageYOffset;
    const winHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    // Determine which section we're inside, plus the local progress.
    // Trigger line: ~28% from top of viewport. We compare section start/end
    // (in doc coords) to (scrollY + triggerY).
    const triggerY = winHeight * 0.28;
    const referenceY = scrollY + triggerY;

    // At very top: anchor 0 with progress 0
    if (scrollY < 4) {
      plane.style.transform = `translateX(${anchorPositions[0]}px) rotate(90deg)`;
      if (lastActive !== 0) {
        setActiveLink(0);
        lastActive = 0;
      }
      return;
    }

    // At very bottom: last anchor with full progress
    if (scrollY + winHeight >= docHeight - 4) {
      const lastIdx = anchorPositions.length - 1;
      plane.style.transform = `translateX(${anchorPositions[lastIdx]}px) rotate(90deg)`;
      if (lastActive !== lastIdx) {
        setActiveLink(lastIdx);
        lastActive = lastIdx;
      }
      return;
    }

    // Find current section: largest i where section[i].start <= referenceY
    let currentIdx = 0;
    for (let i = 0; i < sectionRanges.length; i++) {
      if (sectionRanges[i].start <= referenceY) {
        currentIdx = i;
      } else {
        break;
      }
    }

    const range = sectionRanges[currentIdx];
    const sectionLength = Math.max(1, range.end - range.start);
    let localProgress = (referenceY - range.start) / sectionLength;
    localProgress = Math.max(0, Math.min(1, localProgress));

    // Anchor X for current and next section
    const currentX = anchorPositions[currentIdx];
    const nextX =
      currentIdx + 1 < anchorPositions.length
        ? anchorPositions[currentIdx + 1]
        : currentX;

    const eased = ease(localProgress);
    const x = currentX + (nextX - currentX) * eased;

    // Tilt slightly forward as it accelerates
    const tilt = 90 + (eased - 0.5) * 6;
    plane.style.transform = `translateX(${x}px) rotate(${tilt}deg)`;

    // Active link: switches at midpoint between two sections (i.e. when
    // localProgress crosses 0.5)
    const activeIdx = localProgress > 0.5 && currentIdx + 1 < anchors.length
      ? currentIdx + 1
      : currentIdx;
    if (activeIdx !== lastActive) {
      setActiveLink(activeIdx);
      lastActive = activeIdx;
    }
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      updatePlanePosition();
      ticking = false;
    });
  };

  const onResize = () => {
    measureAnchors();
    measureSections();
    updatePlanePosition();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  // Click handlers don't need special handling: smooth scroll triggers
  // scroll events that move the plane naturally.

  // Initial setup: measure once fonts/layout settle, then once images load.
  const initialMeasure = () => {
    measureAnchors();
    measureSections();
    updatePlanePosition();
  };

  if (document.readyState === 'complete') {
    initialMeasure();
  } else {
    window.addEventListener('load', () => {
      setTimeout(initialMeasure, 80);
    });
  }

  // Re-measure after a small delay in case fonts swap and shift positions
  setTimeout(() => {
    measureAnchors();
    measureSections();
    updatePlanePosition();
  }, 600);

  // ----------------------------------------------------------------
  // Reveal-on-scroll for chapters and stats
  // ----------------------------------------------------------------
  if ('IntersectionObserver' in window) {
    const revealTargets = document.querySelectorAll(
      '.chapter, .stat, .credits__card, .intro__heading, .intro__body'
    );

    revealTargets.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = 'opacity 0.7s ease-out, transform 0.7s ease-out';
    });

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -80px 0px', threshold: 0.05 }
    );

    revealTargets.forEach((el) => revealObserver.observe(el));
  }

  // ----------------------------------------------------------------
  // Console banner (developer easter egg)
  // ----------------------------------------------------------------
  if (window.console && console.log) {
    console.log(
      '%c FROM HORMUZ TO THE BOARDING GATE ',
      'background:#0a1628;color:#d65a2e;font-family:monospace;font-size:14px;font-weight:bold;padding:8px 12px;letter-spacing:0.2em;'
    );
    console.log(
      '%c M126 · Data Visualization · NKUA · 2026 ',
      'color:#0a1628;background:#f5f1e8;font-family:monospace;font-size:11px;padding:4px 8px;letter-spacing:0.15em;'
    );
  }
})();


// ---------------------------------------------------------------------
// v21: Responsive scaling for <tableau-viz> embeds.
// We don't touch the iframe directly — we read the parent width and
// set --t-scale on each .tableau-viz-scaler so it shrinks proportionally
// when the chapter card is narrower than the dashboard's native size.
// ---------------------------------------------------------------------
(() => {
  const scalers = Array.from(document.querySelectorAll('.tableau-viz-scaler'));
  if (!scalers.length) return;

  function readBase(el, prop, fallback) {
    const raw = getComputedStyle(el).getPropertyValue(prop).trim();
    const num = parseFloat(raw);
    return Number.isFinite(num) && num > 0 ? num : fallback;
  }

  function resize() {
    scalers.forEach((el) => {
      const baseW = readBase(el, '--t-base-w', 1200);
      const baseH = readBase(el, '--t-base-h', 800);
      const toolbarH = readBase(el, '--t-toolbar-h', 36);
      // Available width is the inner width of the wrapping card minus the
      // 12px of horizontal padding we set on .tableau-embed-wrap.
      const parent = el.parentElement || el;
      const available = parent.clientWidth || baseW;
      const scale = Math.min(1, available / baseW);
      el.style.setProperty('--t-scale', String(scale));
      // Explicit pixel height so the wrapper collapses with the scaled viz.
      el.style.height = `${Math.ceil((baseH + toolbarH) * scale)}px`;
    });
  }

  // Initial + on resize.
  window.addEventListener('load', resize);
  window.addEventListener('resize', resize);
  // Re-run a couple of times because <tableau-viz> may not be hydrated yet
  // when the load event fires.
  setTimeout(resize, 400);
  setTimeout(resize, 1200);
  setTimeout(resize, 2400);

  // Re-run when each Tableau viz signals it's interactive.
  document.querySelectorAll('tableau-viz').forEach((viz) => {
    viz.addEventListener('firstinteractive', resize);
  });
})();
