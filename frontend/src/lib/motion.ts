// Пресеты Framer Motion. Анимируем только transform/opacity (GPU).
// prefers-reduced-motion дополнительно гасится в theme.css.

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

export const slideInRight = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16 },
  transition: { type: "spring", stiffness: 380, damping: 32 },
};

// Stagger для строк списка (применяется только к видимому окну виртуализации).
export const listItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18 },
};

export const composerSpring = {
  initial: { opacity: 0, scale: 0.96, y: 20 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 20 },
  transition: { type: "spring", stiffness: 320, damping: 30 },
};
