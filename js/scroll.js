/**
 * Daylight Auto-Hiding Custom Scrollbars
 * Keeps scrollbars 100% invisible when idle and reveals colored scrollbars
 * during active scrolling or when hovering/dragging near the scrollbar edge.
 */
(() => {
  function attachAutoHideScrollbar(target, { isRoot = false } = {}) {
    if (!target) return;
    let hideTimer = null;
    let isScrolling = false;
    let isHoveringEdge = false;
    let isDraggingThumb = false;

    const getRightEdge = () => (isRoot ? window.innerWidth : target.getBoundingClientRect().right);
    const canScroll = () => target.scrollHeight > target.clientHeight + 1;

    const setHover = (next) => {
      if (next === isHoveringEdge) return;
      isHoveringEdge = next;
      target.classList.toggle("is-scrollbar-hover", next);
    };

    const showBriefly = () => {
      if (!canScroll()) return;
      if (!isScrolling) {
        isScrolling = true;
        target.classList.add("is-scrolling");
      }
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        isScrolling = false;
        target.classList.remove("is-scrolling");
      }, 1050);
    };

    const scrollEventHost = isRoot ? window : target;
    scrollEventHost.addEventListener("scroll", showBriefly, { passive: true });
    scrollEventHost.addEventListener("wheel", showBriefly, { passive: true });
    scrollEventHost.addEventListener("touchstart", showBriefly, { passive: true });

    const hoverHost = isRoot ? document : target;
    hoverHost.addEventListener("mousemove", (event) => {
      if (isDraggingThumb) return;
      const rightEdge = getRightEdge();
      const nearRightEdge = event.clientX >= rightEdge - 22 && event.clientX <= rightEdge + 4;
      setHover(Boolean(canScroll() && nearRightEdge));
    }, { passive: true });

    hoverHost.addEventListener("pointerdown", (event) => {
      const rightEdge = getRightEdge();
      if (canScroll() && event.clientX >= rightEdge - 22 && event.clientX <= rightEdge + 4) {
        isDraggingThumb = true;
        setHover(true);
      }
    }, { passive: true });

    window.addEventListener("pointerup", () => {
      if (!isDraggingThumb) return;
      isDraggingThumb = false;
      setHover(false);
      showBriefly();
    }, { passive: true });

    if (!isRoot) {
      target.addEventListener("mouseleave", () => {
        if (!isDraggingThumb) setHover(false);
      });
    }
  }

  function initDaylightScrollbars() {
    if (!document.body.classList.contains("ai-page")) {
      attachAutoHideScrollbar(document.documentElement, { isRoot: true });
    }
    document.querySelectorAll(".ai-chat-messages, .ai-history-list, .daylight-scroll").forEach((el) => {
      attachAutoHideScrollbar(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDaylightScrollbars);
  } else {
    initDaylightScrollbars();
  }
})();
