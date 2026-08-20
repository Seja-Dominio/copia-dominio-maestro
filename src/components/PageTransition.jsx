import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { useNavigation } from "@/components/NavigationStack";

export default function PageTransition({ children }) {
  const { pathname } = useLocation();
  const { direction } = useNavigation();

  const xIn  = direction >= 0 ? "100%" : "-30%";
  const xOut = direction >= 0 ? "-30%" : "100%";

  const variants = {
    initial: { x: xIn,  opacity: direction === 0 ? 0 : 1 },
    animate: { x: "0%", opacity: 1 },
    exit:    { x: xOut, opacity: direction === 0 ? 0 : 0.6 },
  };

  const transition = {
    type: "spring",
    stiffness: 380,
    damping: 38,
    mass: 0.9,
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transition}
        style={{ willChange: "transform, opacity", overflow: "hidden" }}
        className="min-h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}