/**
 * Daylight Smooth Auto-Hiding Custom Overlay Scrollbars
 * Hides native scrollbars while keeping native scroll physics 100% intact,
 * rendering GPU-composited purple gradient overlay thumbs that fade smoothly
 * in on activity and gently melt away into invisibility when idle.
 */
(() => {
  const IDLE_HIDE_DELAY_MS = 900;
  const MIN_THUMB_HEIGHT_PX = 32;
  const VERTICAL_INSET_PX = 6;

  function createOverlayScrollbar(target, { isRoot = false, isPanel = false } = {}) {
    if (!target) return;

    if (isRoot) {
      target.classList.add("daylight-scroll-root");
    }

    const track = document.createElement("div");
    track.className = "daylight-scrollbar-track is-hidden";
    if (isPanel) {
      track.classList.add("is-panel");
    } else {
      track.classList.add("is-interactive");
    }
    track.setAttribute("aria-hidden", "true");

    const thumb = document.createElement("div");
    thumb.className = "daylight-scrollbar-thumb";

    const pill = document.createElement("div");
    pill.className = "daylight-scrollbar-pill";

    thumb.appendChild(pill);
    track.appendChild(thumb);
    document.body.appendChild(track);

    let hideTimer = null;
    let rafId = 0;
    let isScrolling = false;
    let isEdgeHover = false;
    let isDragging = false;
    let dragStartY = 0;
    let dragStartScrollTop = 0;
    let prevInlineScrollBehavior = "";
    let currentThumbHeight = 0;
    let currentTrackHeight = 0;

    const getScrollMetrics = () => {
      if (isRoot) {
        const scrollHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body ? document.body.scrollHeight : 0
        );
        const clientHeight = window.innerHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        return {
          scrollHeight,
          clientHeight,
          scrollTop,
          rect: {
            top: 0,
            bottom: window.innerHeight,
            left: 0,
            right: window.innerWidth,
            width: window.innerWidth,
            height: window.innerHeight,
          },
        };
      }

      return {
        scrollHeight: target.scrollHeight,
        clientHeight: target.clientHeight,
        scrollTop: target.scrollTop,
        rect: target.getBoundingClientRect(),
      };
    };

    const setScrollTopInstant = (nextTop) => {
      if (isRoot) {
        window.scrollTo({ top: nextTop, behavior: "auto" });
      } else {
        target.scrollTop = nextTop;
      }
    };

    const updateVisibility = () => {
      const shouldShow = isScrolling || isEdgeHover || isDragging;
      track.classList.toggle("is-visible", shouldShow);
      track.classList.toggle("is-dragging", isDragging);
    };

    const showBriefly = () => {
      const { scrollHeight, clientHeight } = getScrollMetrics();
      if (scrollHeight <= clientHeight + 1) return;

      isScrolling = true;
      updateVisibility();
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        isScrolling = false;
        updateVisibility();
      }, IDLE_HIDE_DELAY_MS);
    };

    const syncNow = () => {
      rafId = 0;
      const { scrollHeight, clientHeight, scrollTop, rect } = getScrollMetrics();
      const maxScroll = scrollHeight - clientHeight;
      const isVisibleRect =
        rect.width >= 24 &&
        rect.height >= 24 &&
        rect.right > 0 &&
        rect.left < window.innerWidth &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight;

      if (!isVisibleRect || maxScroll <= 1) {
        track.classList.add("is-hidden");
        isScrolling = false;
        isEdgeHover = false;
        updateVisibility();
        return;
      }

      track.classList.remove("is-hidden");

      const trackWidth = isPanel ? 10 : 14;
      const top = Math.max(0, rect.top + VERTICAL_INSET_PX);
      const bottom = Math.min(window.innerHeight, rect.bottom - VERTICAL_INSET_PX);
      const trackHeight = Math.max(0, bottom - top);

      if (trackHeight < MIN_THUMB_HEIGHT_PX) {
        track.classList.add("is-hidden");
        return;
      }

      currentTrackHeight = trackHeight;
      const trackLeft = Math.min(window.innerWidth - trackWidth, rect.right - trackWidth);

      track.style.top = `${top}px`;
      track.style.left = `${trackLeft}px`;
      track.style.height = `${trackHeight}px`;

      const ratio = clientHeight / scrollHeight;
      const thumbHeight = Math.max(MIN_THUMB_HEIGHT_PX, Math.min(trackHeight, Math.round(trackHeight * ratio)));
      const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
      const scrollFraction = Math.min(1, Math.max(0, scrollTop / maxScroll));
      const thumbTop = maxThumbTop * scrollFraction;

      currentThumbHeight = thumbHeight;

      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translate3d(0, ${thumbTop.toFixed(2)}px, 0)`;
    };

    const scheduleSync = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(syncNow);
    };

    const handleScrollActivity = () => {
      syncNow();
      showBriefly();
    };

    const scrollEventHost = isRoot ? window : target;
    scrollEventHost.addEventListener("scroll", handleScrollActivity, { passive: true });
    scrollEventHost.addEventListener("wheel", showBriefly, { passive: true });
    scrollEventHost.addEventListener("touchstart", showBriefly, { passive: true });

    const edgeZonePx = isPanel ? 12 : 24;

    document.addEventListener(
      "mousemove",
      (event) => {
        if (isDragging) return;
        const { scrollHeight, clientHeight, rect } = getScrollMetrics();
        if (scrollHeight <= clientHeight + 1 || rect.width < 24 || rect.right <= 0) {
          if (isEdgeHover) {
            isEdgeHover = false;
            updateVisibility();
          }
          return;
        }
        const insideVertical = event.clientY >= rect.top && event.clientY <= rect.bottom;
        const nearRightEdge = event.clientX >= rect.right - edgeZonePx && event.clientX <= rect.right + 4;
        const nextEdgeHover = Boolean(insideVertical && nearRightEdge);
        if (nextEdgeHover !== isEdgeHover) {
          isEdgeHover = nextEdgeHover;
          if (nextEdgeHover) syncNow();
          updateVisibility();
        }
      },
      { passive: true }
    );

    document.addEventListener("mouseleave", () => {
      if (!isDragging && isEdgeHover) {
        isEdgeHover = false;
        updateVisibility();
      }
    });

    thumb.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      syncNow();
      const { scrollHeight, clientHeight, scrollTop } = getScrollMetrics();
      if (scrollHeight <= clientHeight + 1) return;

      isDragging = true;
      dragStartY = event.clientY;
      dragStartScrollTop = scrollTop;

      if (!isRoot) {
        prevInlineScrollBehavior = target.style.scrollBehavior;
        target.style.scrollBehavior = "auto";
      }

      if (thumb.setPointerCapture) {
        try {
          thumb.setPointerCapture(event.pointerId);
        } catch {
          // Ignore environments disallowing pointer capture on synthetic events
        }
      }
      updateVisibility();
    });

    window.addEventListener("pointermove", (event) => {
      if (!isDragging) return;
      const { scrollHeight, clientHeight } = getScrollMetrics();
      const maxScroll = Math.max(0, scrollHeight - clientHeight);
      const maxThumbTravel = Math.max(1, currentTrackHeight - currentThumbHeight);
      const deltaY = event.clientY - dragStartY;
      const nextScrollTop = Math.min(maxScroll, Math.max(0, dragStartScrollTop + (deltaY / maxThumbTravel) * maxScroll));
      setScrollTopInstant(nextScrollTop);
    });

    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      if (!isRoot) {
        target.style.scrollBehavior = prevInlineScrollBehavior;
      }
      showBriefly();
      updateVisibility();
    };

    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    if (!isPanel) {
      track.addEventListener("mousedown", (event) => {
        if (event.target === thumb || pill.contains(event.target)) return;
        const trackRect = track.getBoundingClientRect();
        const { scrollHeight, clientHeight } = getScrollMetrics();
        const maxScroll = Math.max(0, scrollHeight - clientHeight);
        const maxThumbTravel = Math.max(1, trackRect.height - currentThumbHeight);
        const clickOffset = event.clientY - trackRect.top - currentThumbHeight / 2;
        const targetScroll = Math.min(maxScroll, Math.max(0, (clickOffset / maxThumbTravel) * maxScroll));

        if (isRoot) {
          window.scrollTo({ top: targetScroll, behavior: "smooth" });
        } else {
          target.scrollTo({ top: targetScroll, behavior: "smooth" });
        }
        showBriefly();
      });
    }

    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(scheduleSync);
      ro.observe(target);
      if (isRoot && document.body) {
        ro.observe(document.body);
      }
    }

    if (typeof MutationObserver === "function") {
      const mo = new MutationObserver(scheduleSync);
      mo.observe(target, { childList: true, subtree: true });
      if (!isRoot && target.parentElement) {
        mo.observe(target.parentElement, { attributes: true, attributeFilter: ["class", "hidden"] });
      }
    }

    if (!isRoot && target.parentElement) {
      target.parentElement.addEventListener("transitionend", scheduleSync, { passive: true });
    }

    window.addEventListener("resize", scheduleSync, { passive: true });
    scheduleSync();
  }

  function initDaylightScrollbars() {
    if (!document.body.classList.contains("ai-page")) {
      createOverlayScrollbar(document.documentElement, { isRoot: true, isPanel: false });
    }
    document.querySelectorAll(".ai-chat-messages, .ai-history-list, .daylight-scroll").forEach((el) => {
      const isPanel = el.classList.contains("ai-history-list");
      createOverlayScrollbar(el, { isRoot: false, isPanel });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDaylightScrollbars);
  } else {
    initDaylightScrollbars();
  }
})();
