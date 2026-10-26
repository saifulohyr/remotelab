// Motion specifications:
// - Two-level stagger fade-up
// - Scroll-triggered reveal (whileInView + viewport: { once: true })
// - opacity 0 -> 1, y 16px -> 0, duration 0.5s, easeOut, stagger 0.08s

export const sectionContainerVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
      when: 'beforeChildren',
      staggerChildren: 0.08,
    },
  },
};

export const itemFadeUpVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: 'easeOut',
    },
  },
};

export const barGrowVariant = (delay = 0) => ({
  hidden: { scaleY: 0, originY: 1, opacity: 0 },
  visible: {
    scaleY: 1,
    originY: 1,
    opacity: 1,
    transition: {
      duration: 0.6,
      delay,
      ease: 'easeOut',
    },
  },
});
