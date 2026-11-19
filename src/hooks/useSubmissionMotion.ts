import { useLayoutEffect, useRef } from "react";
import {
  ROW_REORDER_DURATION_MS,
  ROW_REORDER_EASING,
} from "../utils/rowMotion";

export function useSubmissionMotion() {
  const rowElementsRef = useRef(new Map<string, HTMLLIElement>());
  const previousTopsRef = useRef<Map<string, number> | null>(null);
  const animationsRef = useRef(new Map<string, Animation>());
  const entrancesRef = useRef(new Map<string, Animation>());

  useLayoutEffect(() => {
    const animations = animationsRef.current;
    const entrances = entrancesRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancelAnimations = () => {
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      entrances.forEach((animation) => animation.cancel());
      entrances.clear();
    };
    const handleMotionPreference = () => {
      if (reducedMotion.matches) cancelAnimations();
    };

    reducedMotion.addEventListener("change", handleMotionPreference);
    return () => {
      reducedMotion.removeEventListener("change", handleMotionPreference);
      cancelAnimations();
    };
  }, []);

  // Read after every commit: verdict and team updates must not restart motion.
  useLayoutEffect(() => {
    const previousTops = previousTopsRef.current;
    const animations = animationsRef.current;
    const entrances = entrancesRef.current;
    const nextTops = new Map<string, number>();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Batch layout reads before writes, retaining fractional grid gaps. Subtract
    // the active transform to recover layout positions without a visible snap.
    const firstRow = rowElementsRef.current.values().next().value;
    const listTop = firstRow?.parentElement?.getBoundingClientRect().top ?? 0;
    const rows = [...rowElementsRef.current].map(([id, element]) => {
      const previousTop = previousTops?.get(id);
      const style = getComputedStyle(element);
      const translation =
        style.transform === "none"
          ? 0
          : new DOMMatrixReadOnly(style.transform).m42;
      const top = element.getBoundingClientRect().top - listTop - translation;
      nextTops.set(id, top);

      return {
        id,
        element,
        isNew: previousTops !== null && previousTop === undefined,
        moved: previousTop !== undefined && Math.abs(previousTop - top) >= 1,
        deltaY: previousTop === undefined ? 0 : previousTop + translation - top,
      };
    });

    [animations, entrances].forEach((activeAnimations) => {
      activeAnimations.forEach((animation, id) => {
        if (reducedMotion || !nextTops.has(id)) {
          animation.cancel();
          activeAnimations.delete(id);
        }
      });
    });

    if (!reducedMotion) {
      rows.forEach(({ id, element, isNew, moved, deltaY }) => {
        if (isNew) {
          // Keep the entrance on its original timeline through later arrivals.
          // Stacking follows feed order so newer rows appear over older ones.
          const entrance = element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: ROW_REORDER_DURATION_MS,
            easing: ROW_REORDER_EASING,
          });
          entrances.set(id, entrance);
          entrance.onfinish = () => {
            if (entrances.get(id) === entrance) entrances.delete(id);
          };
        }

        if (!moved) return;

        animations.get(id)?.cancel();
        const animation = element.animate(
          [
            { transform: `translateY(${deltaY}px)` },
            { transform: "translateY(0)" },
          ],
          {
            duration: ROW_REORDER_DURATION_MS,
            easing: ROW_REORDER_EASING,
          },
        );
        animations.set(id, animation);
        animation.onfinish = () => {
          if (animations.get(id) === animation) animations.delete(id);
        };
      });
    }

    previousTopsRef.current = nextTops;
  });

  return rowElementsRef;
}
