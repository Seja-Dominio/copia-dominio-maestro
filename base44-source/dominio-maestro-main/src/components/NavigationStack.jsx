import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Tab-level root pages — switching between these resets per-tab stacks
const TAB_PAGES = ["/Dashboard", "/Projects", "/Jobs", "/Agenda", "/ClientPortfolio", "/Financial", "/Reports", "/Conversations", "/Proposals", "/Records", "/Templates", "/Settings"];

const NavigationContext = createContext({ direction: 1, canGoBack: false });
export const useNavigation = () => useContext(NavigationContext);

/** Returns the tab root for a given pathname */
function getTabRoot(pathname) {
  return TAB_PAGES.find(t => pathname === t || pathname.startsWith(t + "/")) ?? pathname;
}

export function NavigationProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabStacks = useRef({});
  const prevPathname = useRef(location.pathname);
  const [direction, setDirection] = useState(1);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const current = location.pathname;
    const prev = prevPathname.current;
    prevPathname.current = current;
    if (current === prev) return;

    const isTabRoot = TAB_PAGES.includes(current);
    const tabRoot = getTabRoot(current);

    if (isTabRoot) {
      tabStacks.current[tabRoot] = [current];
      setDirection(1);
      setCanGoBack(false);
      return;
    }

    if (!tabStacks.current[tabRoot]) {
      tabStacks.current[tabRoot] = [tabRoot];
    }

    const stack = tabStacks.current[tabRoot];
    const prevIndex = stack.indexOf(current);

    if (prevIndex !== -1) {
      setDirection(-1);
      tabStacks.current[tabRoot] = stack.slice(0, prevIndex + 1);
    } else {
      setDirection(1);
      tabStacks.current[tabRoot] = [...stack, current];
    }

    setCanGoBack(tabStacks.current[tabRoot].length > 1);
  }, [location.pathname]);

  // Hardware back button support for iOS/Android WebView
  useEffect(() => {
    const handlePopState = () => {
      // When the browser/WebView fires popstate (hardware back),
      // React Router already handles it. This ensures smooth stack popping.
    };

    // Android WebView bridge: intercept hardware back
    const handleBackButton = (e) => {
      if (window.history.length > 1) {
        navigate(-1);
      }
    };

    // Listen for custom back event from native bridge (Android)
    window.addEventListener("nativeBackPressed", handleBackButton);

    // Expose a global for native WebView bridges to call
    window.__handleNativeBack = () => {
      if (window.history.length > 1) {
        navigate(-1);
      }
    };

    return () => {
      window.removeEventListener("nativeBackPressed", handleBackButton);
      delete window.__handleNativeBack;
    };
  }, [navigate]);

  return (
    <NavigationContext.Provider value={{ direction, canGoBack }}>
      {children}
    </NavigationContext.Provider>
  );
}